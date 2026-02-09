"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authorizedFetch, parseJsonResponse } from "@/lib/browser-auth";
import type { RoomStateDto } from "@/lib/dto";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const NAME_STORAGE_KEY = "bac_display_name";

type Props = {
  code: string;
};

type TurnItem = NonNullable<RoomStateDto["game"]>["history"][number];

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function validateFourDigitsNoRepeats(value: string): string | null {
  if (!value) {
    return null;
  }
  if (value.length < 4) {
    return "Введите 4 цифры.";
  }
  if (new Set(value.split("")).size !== value.length) {
    return "Цифры не должны повторяться.";
  }
  return null;
}

function gameStatusText(state: RoomStateDto | null): string {
  if (!state?.game) {
    return "Ожидание второго игрока";
  }
  if (state.game.status === "waiting_secrets") {
    return "Установка секретных чисел";
  }
  if (state.game.status === "active") {
    return state.game.turnSeat === state.game.mySeat ? "Ваш ход" : "Ход соперника";
  }
  if (state.game.status === "finished") {
    return state.game.winnerSeat === state.game.mySeat ? "Вы победили" : "Матч завершен";
  }
  return "Неизвестный статус";
}

function nextActionText(state: RoomStateDto | null): string {
  if (!state?.game) {
    return "Скопируйте код комнаты и отправьте другу.";
  }

  if (state.game.status === "waiting_secrets") {
    if (!state.game.mySecretSet) {
      return "Введите ваше секретное число из 4 разных цифр.";
    }
    if (!state.game.opponentSecretSet) {
      return "Ваш секрет сохранен. Ждем, пока соперник задаст свой.";
    }
  }

  if (state.game.status === "active") {
    if (state.game.turnSeat === state.game.mySeat) {
      return "Сейчас ваш ход: введите попытку и отправьте.";
    }
    return "Сейчас ход соперника. История обновится автоматически.";
  }

  if (state.game.status === "finished") {
    return "Матч завершен. Нажмите реванш, чтобы начать новый раунд.";
  }

  return "Ожидайте обновления состояния комнаты.";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export function RoomPage({ code }: Props) {
  const [roomState, setRoomState] = useState<RoomStateDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [secretInput, setSecretInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [notice, setNotice] = useState("");

  const roomCode = code.toUpperCase();
  const noticeTimerRef = useRef<number | null>(null);
  const hadRealtimeConnectionRef = useRef(false);

  const pushNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const fetchState = useCallback(async () => {
    const response = await authorizedFetch(`/api/rooms/${roomCode}/state`);
    const payload = await parseJsonResponse<RoomStateDto>(response);
    setRoomState(payload);
    return payload;
  }, [roomCode]);

  const ensureJoined = useCallback(async () => {
    const displayName = window.localStorage.getItem(NAME_STORAGE_KEY) || "Игрок";
    const response = await authorizedFetch("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({
        displayName,
        roomCode
      })
    });
    await parseJsonResponse<{ roomId: string; seat: 1 | 2 }>(response);
    setJoined(true);
  }, [roomCode]);

  const loadRoom = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await ensureJoined();
      await fetchState();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Не удалось подключиться к комнате.");
    } finally {
      setLoading(false);
    }
  }, [ensureJoined, fetchState]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!joined) return;
    const interval = window.setInterval(() => {
      void fetchState().catch(() => null);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [joined, fetchState]);

  useEffect(() => {
    if (!joined) return;
    const interval = window.setInterval(() => {
      void authorizedFetch(`/api/rooms/${roomCode}/heartbeat`, {
        method: "POST"
      }).catch(() => null);
    }, 20000);
    return () => window.clearInterval(interval);
  }, [joined, roomCode]);

  useEffect(() => {
    if (!roomState?.roomId) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`room-events-${roomState.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_events",
          filter: `room_id=eq.${roomState.roomId}`
        },
        () => {
          void fetchState().catch(() => null);
        }
      )
      .subscribe((status) => {
        const subscribed = status === "SUBSCRIBED";
        setRealtimeReady(subscribed);

        if (subscribed) {
          hadRealtimeConnectionRef.current = true;
          return;
        }

        if (hadRealtimeConnectionRef.current) {
          pushNotice("Связь realtime потеряна. Продолжаем обновлять комнату каждые 3 секунды.");
        }
      });

    return () => {
      setRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [roomState?.roomId, fetchState, pushNotice]);

  const submitSecret = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomState?.game) return;

    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/games/${roomState.game.id}/secret`, {
        method: "POST",
        body: JSON.stringify({ secret: secretInput })
      });
      await parseJsonResponse(response);
      setSecretInput("");
      await fetchState();
      pushNotice("Секрет сохранен.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка отправки секрета.");
    } finally {
      setBusy(false);
    }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomState?.game) return;

    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/games/${roomState.game.id}/guess`, {
        method: "POST",
        body: JSON.stringify({ guess: guessInput })
      });
      await parseJsonResponse(response);
      setGuessInput("");
      await fetchState();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка отправки хода.");
    } finally {
      setBusy(false);
    }
  };

  const submitRematchVote = async () => {
    if (!roomState?.game) return;

    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/games/${roomState.game.id}/rematch-vote`, {
        method: "POST",
        body: JSON.stringify({ vote: true })
      });
      await parseJsonResponse(response);
      await fetchState();
      pushNotice("Голос за реванш отправлен.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка голосования за реванш.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await copyText(roomCode);
      pushNotice("Код комнаты скопирован.");
    } catch {
      setError("Не удалось скопировать код комнаты.");
    }
  };

  const handleCopyInvite = async () => {
    try {
      const inviteUrl = `${window.location.origin}/room/${roomCode}`;
      await copyText(inviteUrl);
      pushNotice("Ссылка-приглашение скопирована.");
    } catch {
      setError("Не удалось скопировать ссылку.");
    }
  };

  const handleNativeShare = async () => {
    try {
      const inviteUrl = `${window.location.origin}/room/${roomCode}`;
      if (navigator.share) {
        await navigator.share({
          title: "Быки и коровы онлайн",
          text: `Присоединяйся к моей комнате: ${roomCode}`,
          url: inviteUrl
        });
        return;
      }
      await copyText(inviteUrl);
      pushNotice("Ссылка-приглашение скопирована.");
    } catch {
      setError("Не удалось поделиться ссылкой.");
    }
  };

  const canSetSecret = useMemo(() => {
    return Boolean(roomState?.game && roomState.game.status === "waiting_secrets" && !roomState.game.mySecretSet);
  }, [roomState]);

  const canGuess = useMemo(() => {
    return Boolean(roomState?.game && roomState.game.status === "active" && roomState.game.turnSeat === roomState.game.mySeat);
  }, [roomState]);

  const secretValidationError = useMemo(() => validateFourDigitsNoRepeats(secretInput), [secretInput]);
  const guessValidationError = useMemo(() => validateFourDigitsNoRepeats(guessInput), [guessInput]);

  const canSubmitSecret = Boolean(canSetSecret && secretInput.length === 4 && !secretValidationError && !busy);
  const canSubmitGuess = Boolean(canGuess && guessInput.length === 4 && !guessValidationError && !busy);

  const myTurns = useMemo(() => {
    if (!roomState?.game) return [] as TurnItem[];
    return roomState.game.history.filter((turn) => turn.guesserSeat === roomState.game?.mySeat);
  }, [roomState]);

  const opponentTurns = useMemo(() => {
    if (!roomState?.game) return [] as TurnItem[];
    return roomState.game.history.filter((turn) => turn.guesserSeat !== roomState.game?.mySeat);
  }, [roomState]);

  const latestTurnNo = roomState?.game?.history.at(-1)?.turnNo ?? null;
  const winnerName = roomState?.players.find((player) => player.seat === roomState?.game?.winnerSeat)?.name ?? "Игрок";

  if (loading) {
    return (
      <main className="page-wrap">
        <p>Загружаем комнату...</p>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div style={{ marginBottom: 10 }}>
        <Link href="/">На главную</Link>
      </div>

      <section className="hero">
        <h1>Комната {roomCode}</h1>
        <p>
          Статус: <span className="badge">{gameStatusText(roomState)}</span>{" "}
          <span className={`badge ${realtimeReady ? "connection-ok" : "connection-fallback"}`}>
            {realtimeReady ? "Realtime: онлайн" : "Realtime: polling"}
          </span>
        </p>
      </section>

      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!roomState ? (
        <section className="card">
          <p className="hint">Не удалось загрузить комнату. Проверьте сеть и попробуйте снова.</p>
          <button type="button" onClick={() => void loadRoom()}>
            Повторить подключение
          </button>
        </section>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 14 }}>
            <h2 className="section-title">Поделиться комнатой</h2>
            <p className="hint">Код: {roomCode}</p>
            <div className="share-actions">
              <button type="button" className="secondary" onClick={handleCopyCode}>
                Копировать код
              </button>
              <button type="button" className="ghost" onClick={handleCopyInvite}>
                Копировать ссылку
              </button>
              <button type="button" className="ghost" onClick={handleNativeShare}>
                Поделиться
              </button>
            </div>
          </section>

          <section className={`card turn-banner ${canGuess ? "my-turn" : "wait-turn"}`} style={{ marginBottom: 14 }}>
            <h2 className="section-title">Что сейчас делать</h2>
            <p>{nextActionText(roomState)}</p>
          </section>

          <section className="card" style={{ marginBottom: 14 }}>
            <h2 className="section-title">Игроки</h2>
            <div className="players-grid">
              {roomState.players.map((player) => (
                <div className="mini-card" key={player.seat}>
                  <strong>
                    Игрок {player.seat}: {player.name}
                  </strong>
                  <span className={player.online ? "online" : "offline"}>{player.online ? "онлайн" : "не в сети"}</span>
                </div>
              ))}
            </div>
          </section>

          {roomState.game ? (
            <>
              <section className="card" style={{ marginBottom: 14 }}>
                <h2 className="section-title">Раунд {roomState.game.roundNo}</h2>
                <div className="status-grid">
                  <div className="mini-card">
                    <strong>Ваше место</strong>
                    <span>Игрок {roomState.game.mySeat}</span>
                  </div>
                  <div className="mini-card">
                    <strong>Секрет</strong>
                    <span>{roomState.game.mySecretSet ? "задан" : "не задан"}</span>
                  </div>
                </div>
              </section>

              {canSetSecret ? (
                <section className="card" style={{ marginBottom: 14 }}>
                  <h2 className="section-title">Введите секретное число</h2>
                  <form id="secret-form" onSubmit={submitSecret}>
                    <label htmlFor="secretInput">4 разные цифры</label>
                    <input
                      id="secretInput"
                      value={secretInput}
                      onChange={(event) => setSecretInput(normalizeDigits(event.target.value))}
                      placeholder="Например, 4831"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]*"
                    />
                    {secretValidationError ? <p className="error" style={{ marginTop: 8 }}>{secretValidationError}</p> : null}
                    <div className="inline-actions">
                      <button className="secondary desktop-only" disabled={!canSubmitSecret} type="submit">
                        Сохранить секрет
                      </button>
                      <button type="button" className="ghost" onClick={() => setSecretInput("")} disabled={!secretInput}>
                        Очистить
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              {canGuess ? (
                <section className="card" style={{ marginBottom: 14 }}>
                  <h2 className="section-title">Ваш ход</h2>
                  <form id="guess-form" onSubmit={submitGuess}>
                    <label htmlFor="guessInput">Попытка (4 разные цифры)</label>
                    <input
                      id="guessInput"
                      value={guessInput}
                      onChange={(event) => setGuessInput(normalizeDigits(event.target.value))}
                      placeholder="Например, 9052"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]*"
                    />
                    {guessValidationError ? <p className="error" style={{ marginTop: 8 }}>{guessValidationError}</p> : null}
                    <div className="inline-actions">
                      <button className="secondary desktop-only" disabled={!canSubmitGuess} type="submit">
                        Отправить ход
                      </button>
                      <button type="button" className="ghost" onClick={() => setGuessInput("")} disabled={!guessInput}>
                        Очистить
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              <section className="card" style={{ marginBottom: 14 }}>
                <h2 className="section-title">Ходы игроков (раздельные окна)</h2>
                <div className="split-turns">
                  <div className="mini-card">
                    <strong>Ваши ходы ({myTurns.length})</strong>
                    {myTurns.length ? (
                      <ul className="history">
                        {myTurns.map((turn) => (
                          <li key={`my-${turn.turnNo}`} className={turn.turnNo === latestTurnNo ? "last-turn" : ""}>
                            #{turn.turnNo}: {turn.guess} {"->"} {turn.bulls}Б / {turn.cows}К
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">Пока нет ваших ходов.</p>
                    )}
                  </div>

                  <div className="mini-card">
                    <strong>Ходы соперника ({opponentTurns.length})</strong>
                    {opponentTurns.length ? (
                      <ul className="history">
                        {opponentTurns.map((turn) => (
                          <li key={`op-${turn.turnNo}`} className={turn.turnNo === latestTurnNo ? "last-turn" : ""}>
                            #{turn.turnNo}: {turn.guess} {"->"} {turn.bulls}Б / {turn.cows}К
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">Пока нет ходов соперника.</p>
                    )}
                  </div>
                </div>
              </section>

              {roomState.game.status === "finished" ? (
                <section className="card" style={{ marginBottom: 90 }}>
                  <h2 className="section-title">Итог матча и реванш</h2>
                  <p className="hint">
                    Победитель: <strong>{winnerName}</strong>. Всего ходов: <strong>{roomState.game.history.length}</strong>.
                  </p>
                  <p className="hint">
                    Реванш: Игрок 1 {roomState.game.rematchVotes.seat1 ? "готов" : "ждет"} / Игрок 2{" "}
                    {roomState.game.rematchVotes.seat2 ? "готов" : "ждет"}
                  </p>
                  <button className="ghost desktop-only" disabled={busy} onClick={submitRematchVote} type="button">
                    Хочу реванш
                  </button>
                </section>
              ) : (
                <div style={{ marginBottom: 90 }} />
              )}
            </>
          ) : (
            <section className="card" style={{ marginBottom: 90 }}>
              <p>Ждем второго игрока. Отправьте другу код: {roomCode}</p>
            </section>
          )}
        </>
      )}

      {roomState?.game ? (
        <div className="mobile-action-bar">
          {canSetSecret ? (
            <button form="secret-form" disabled={!canSubmitSecret} type="submit">
              Сохранить секрет
            </button>
          ) : null}
          {canGuess ? (
            <button form="guess-form" disabled={!canSubmitGuess} type="submit" className="secondary">
              Отправить ход
            </button>
          ) : null}
          {roomState.game.status === "finished" ? (
            <button type="button" className="ghost" onClick={submitRematchVote} disabled={busy}>
              Хочу реванш
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
