"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfettiLayer } from "@/components/confetti-layer";
import { ToastRegion } from "@/components/toast-region";
import { UiControls } from "@/components/ui-controls";
import { authorizedFetch, parseJsonResponse } from "@/lib/browser-auth";
import { addMatch, addOrUpdateFriend } from "@/lib/local-social";
import { playSfx } from "@/lib/sound";
import type { RoomStateDto } from "@/lib/dto";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToastQueue } from "@/lib/use-toast-queue";

const NAME_STORAGE_KEY = "bac_display_name";

type Props = {
  code: string;
};

type TurnItem = NonNullable<RoomStateDto["game"]>["history"][number];

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function validateFourDigitsNoRepeats(value: string): string | null {
  if (!value) return null;
  if (value.length < 4) return "Введите 4 цифры.";
  if (new Set(value.split("")).size !== value.length) return "Цифры не должны повторяться.";
  return null;
}

function formatTimer(secondsLeft: number): string {
  const safe = Math.max(0, secondsLeft);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function gameStatusText(state: RoomStateDto | null): string {
  if (!state?.game) return "Ожидание второго игрока";
  if (state.game.status === "waiting_secrets") return "Установка секретных чисел";
  if (state.game.status === "active") {
    return state.game.turnSeat === state.game.mySeat ? "Ваш ход" : "Ход соперника";
  }
  if (state.game.status === "finished") {
    return state.game.winnerSeat === state.game.mySeat ? "Вы победили" : "Матч завершен";
  }
  return "Неизвестный статус";
}

function nextActionText(state: RoomStateDto | null): string {
  if (!state?.game) return "Скопируйте код комнаты и отправьте другу.";

  if (state.game.status === "waiting_secrets") {
    if (!state.game.mySecretSet) return "Введите ваше секретное число из 4 разных цифр.";
    if (!state.game.opponentSecretSet) return "Ваш секрет сохранен. Ждем, пока соперник задаст свой.";
  }

  if (state.game.status === "active") {
    if (state.game.turnSeat === state.game.mySeat) return "Сейчас ваш ход: введите попытку и отправьте.";
    return "Сейчас ход соперника. История обновится автоматически.";
  }

  if (state.game.status === "finished") return "Матч завершен. Нажмите реванш, чтобы начать новый раунд.";
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
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [turnSecondsDraft, setTurnSecondsDraft] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roomCode = code.toUpperCase();
  const { toasts, pushToast, removeToast } = useToastQueue();
  const hadRealtimeConnectionRef = useRef(false);
  const hinted10sRef = useRef("");
  const previousGameSnapshotRef = useRef<{
    id: string;
    status: string;
    turnSeat: number | null;
    historySize: number;
    winnerSeat: number | null;
  } | null>(null);

  const fetchState = useCallback(async () => {
    const response = await authorizedFetch(`/api/rooms/${roomCode}/state`);
    const payload = await parseJsonResponse<RoomStateDto>(response);
    setRoomState(payload);
    return payload;
  }, [roomCode]);

  useEffect(() => {
    if (!roomState) return;
    if (turnSecondsDraft === null) {
      setTurnSecondsDraft(roomState.settings.turnSeconds);
    }
  }, [roomState, turnSecondsDraft]);

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
      const message = joinError instanceof Error ? joinError.message : "Не удалось подключиться к комнате.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    } finally {
      setLoading(false);
    }
  }, [ensureJoined, fetchState, pushToast]);

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
      void authorizedFetch(`/api/rooms/${roomCode}/heartbeat`, { method: "POST" }).catch(() => null);
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
          pushToast("Связь realtime потеряна. Работаем через polling.", "info");
          playSfx("error");
        }
      });

    return () => {
      setRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [roomState?.roomId, fetchState, pushToast]);

  useEffect(() => {
    const game = roomState?.game;
    if (!game) return;

    const prev = previousGameSnapshotRef.current;
    const current = {
      id: game.id,
      status: game.status,
      turnSeat: game.turnSeat,
      historySize: game.history.length,
      winnerSeat: game.winnerSeat
    };

    if (prev && prev.id === current.id) {
      if (current.historySize > prev.historySize) {
        playSfx("turn");
      }
      if (current.status === "finished" && prev.status !== "finished") {
        if (current.winnerSeat && current.winnerSeat === game.mySeat) {
          playSfx("win");
        } else {
          playSfx("error");
        }
      }
    }

    previousGameSnapshotRef.current = current;
  }, [roomState?.game]);

  useEffect(() => {
    const game = roomState?.game;
    const turnSeconds = roomState?.settings.turnSeconds ?? 0;
    const deadline = game?.turnDeadlineAt;
    if (!deadline || turnSeconds === 0) {
      setSecondsLeft(null);
      hinted10sRef.current = "";
      return;
    }

    const update = () => {
      const left = Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000);
      setSecondsLeft(left);

      if (game.turnSeat === game.mySeat && left <= 10 && left > 0) {
        const key = `${game.id}-${deadline}`;
        if (hinted10sRef.current !== key) {
          hinted10sRef.current = key;
          pushToast("Осталось меньше 10 секунд на ход.", "info");
          playSfx("turn");
        }
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [roomState, pushToast]);

  useEffect(() => {
    if (!roomState?.game) return;
    const mySeat = roomState.game.mySeat;
    if (!mySeat) return;

    const opponent = roomState.players.find((player) => player.seat !== mySeat);
    if (opponent) {
      addOrUpdateFriend(opponent.name);
    }

    if (roomState.game.status !== "finished") return;
    if (!roomState.game.winnerSeat || !opponent) return;

    addMatch({
      gameId: roomState.game.id,
      roomCode: roomState.roomCode,
      opponentName: opponent.name,
      result: roomState.game.winnerSeat === mySeat ? "win" : "lose",
      turns: roomState.game.history.length,
      finishedAt: new Date().toISOString()
    });
  }, [roomState]);

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
      pushToast("Секрет сохранен.", "success");
      playSfx("success");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Ошибка отправки секрета.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
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
      pushToast("Ход отправлен.", "success");
      playSfx("turn");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Ошибка отправки хода.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
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
      pushToast("Голос за реванш отправлен.", "success");
      playSfx("success");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Ошибка голосования за реванш.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    } finally {
      setBusy(false);
    }
  };

  const submitChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    try {
      const response = await authorizedFetch(`/api/rooms/${roomCode}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: chatInput })
      });
      await parseJsonResponse(response);
      setChatInput("");
      await fetchState();
      pushToast("Сообщение отправлено.", "success");
      playSfx("click");
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : "Не удалось отправить сообщение.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    }
  };

  const saveTurnMode = async () => {
    if (!roomState) return;
    try {
      const response = await authorizedFetch(`/api/rooms/${roomCode}/settings`, {
        method: "POST",
        body: JSON.stringify({
          turnSeconds: turnSecondsDraft ?? roomState.settings.turnSeconds
        })
      });
      await parseJsonResponse(response);
      await fetchState();
      pushToast("Режим таймера обновлен.", "success");
      playSfx("success");
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "Не удалось обновить режим.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    }
  };

  const handleCopyCode = async () => {
    try {
      await copyText(roomCode);
      pushToast("Код комнаты скопирован.", "success");
      playSfx("click");
    } catch {
      pushToast("Не удалось скопировать код комнаты.", "error");
      playSfx("error");
    }
  };

  const handleCopyInvite = async () => {
    try {
      const inviteUrl = `${window.location.origin}/room/${roomCode}`;
      await copyText(inviteUrl);
      pushToast("Ссылка приглашения скопирована.", "success");
      playSfx("click");
    } catch {
      pushToast("Не удалось скопировать ссылку.", "error");
      playSfx("error");
    }
  };

  const handleCopySpectatorLink = async () => {
    if (!roomState?.spectatorPath) return;
    try {
      await copyText(`${window.location.origin}${roomState.spectatorPath}`);
      pushToast("Ссылка наблюдателя скопирована.", "success");
      playSfx("click");
    } catch {
      pushToast("Не удалось скопировать ссылку наблюдателя.", "error");
      playSfx("error");
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
        pushToast("Ссылка отправлена.", "success");
      } else {
        await copyText(inviteUrl);
        pushToast("Ссылка приглашения скопирована.", "success");
      }
      playSfx("click");
    } catch {
      pushToast("Не удалось поделиться ссылкой.", "error");
      playSfx("error");
    }
  };

  const canSetSecret = useMemo(() => Boolean(roomState?.game && roomState.game.status === "waiting_secrets" && !roomState.game.mySecretSet), [roomState]);
  const canGuess = useMemo(() => Boolean(roomState?.game && roomState.game.status === "active" && roomState.game.turnSeat === roomState.game.mySeat), [roomState]);

  const secretValidationError = useMemo(() => validateFourDigitsNoRepeats(secretInput), [secretInput]);
  const guessValidationError = useMemo(() => validateFourDigitsNoRepeats(guessInput), [guessInput]);
  const canSubmitSecret = Boolean(canSetSecret && secretInput.length === 4 && !secretValidationError && !busy);
  const canSubmitGuess = Boolean(canGuess && guessInput.length === 4 && !guessValidationError && !busy);

  const myTurns = useMemo(() => {
    if (!roomState?.game || !roomState.game.mySeat) return [] as TurnItem[];
    return roomState.game.history.filter((turn) => turn.guesserSeat === roomState.game?.mySeat);
  }, [roomState]);

  const opponentTurns = useMemo(() => {
    if (!roomState?.game || !roomState.game.mySeat) return [] as TurnItem[];
    return roomState.game.history.filter((turn) => turn.guesserSeat !== roomState.game?.mySeat);
  }, [roomState]);

  const latestTurnNo = roomState?.game?.history.at(-1)?.turnNo ?? null;
  const winnerName = roomState?.players.find((player) => player.seat === roomState?.game?.winnerSeat)?.name ?? "Игрок";
  const iWon = Boolean(roomState?.game?.status === "finished" && roomState.game.winnerSeat && roomState.game.winnerSeat === roomState.game.mySeat);

  if (loading) {
    return (
      <main className="page-wrap">
        <p>Загружаем комнату...</p>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <a href="#room-main-content" className="skip-link">
        Перейти к основному контенту
      </a>

      <ConfettiLayer active={iWon} />
      <ToastRegion toasts={toasts} onDismiss={removeToast} />

      <div style={{ marginBottom: 10 }}>
        <Link href="/">На главную</Link>
      </div>

      <section className="hero" id="room-main-content">
        <h1>Комната {roomCode}</h1>
        <p>
          Статус: <span className="badge">{gameStatusText(roomState)}</span>{" "}
          <span className={`badge ${realtimeReady ? "connection-ok" : "connection-fallback"}`}>
            {realtimeReady ? "Realtime: онлайн" : "Realtime: polling"}
          </span>
          <span className="badge timer-mode-badge">{roomState?.settings.turnSeconds ? `Блиц ${roomState.settings.turnSeconds}с` : "Классика"}</span>
        </p>
      </section>

      <button
        type="button"
        className="mobile-menu-trigger"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((prev) => !prev)}
      >
        {mobileMenuOpen ? "Закрыть меню" : "Меню"}
      </button>

      {error ? <p className="error">{error}</p> : null}

      {!roomState ? (
        <section className="card">
          <p className="hint">Не удалось загрузить комнату. Проверьте сеть и попробуйте снова.</p>
          <button type="button" onClick={() => void loadRoom()}>
            Повторить подключение
          </button>
        </section>
      ) : (
        <div className="room-layout">
          <div className="room-main">
            <section className="card fade-in" style={{ marginBottom: 14 }}>
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
                {roomState.spectatorPath ? (
                  <button type="button" className="ghost" onClick={handleCopySpectatorLink}>
                    Ссылка наблюдателя
                  </button>
                ) : null}
              </div>
            </section>

            <section className={`card turn-banner ${canGuess ? "my-turn" : "wait-turn"} fade-in`} style={{ marginBottom: 14 }}>
              <h2 className="section-title">Что сейчас делать</h2>
              <p>{nextActionText(roomState)}</p>
              {roomState.game?.status === "active" && roomState.settings.turnSeconds > 0 ? (
                <p className="timer-line">
                  До конца хода:{" "}
                  <strong className={secondsLeft !== null && secondsLeft <= 10 ? "timer-danger" : ""}>
                    {secondsLeft !== null ? formatTimer(secondsLeft) : "--:--"}
                  </strong>
                </p>
              ) : null}
            </section>

            {roomState.game ? (
              <>
                <section className="card fade-in" style={{ marginBottom: 14 }}>
                  <h2 className="section-title">Раунд {roomState.game.roundNo}</h2>
                  <div className="status-grid">
                    <div className="mini-card">
                      <strong>Ваше место</strong>
                      <span>{roomState.game.mySeat ? `Игрок ${roomState.game.mySeat}` : "Наблюдатель"}</span>
                    </div>
                    <div className="mini-card">
                      <strong>Секрет</strong>
                      <span>{roomState.game.mySecretSet ? "задан" : "не задан"}</span>
                    </div>
                    <div className="mini-card">
                      <strong>Ваше число</strong>
                      <span>{roomState.game.mySecretSet ? roomState.game.mySecret ?? "----" : "----"}</span>
                    </div>
                  </div>
                </section>

                {canSetSecret ? (
                  <section className="card fade-in" style={{ marginBottom: 14 }}>
                    <h2 className="section-title">Введите секретное число</h2>
                    <form id="secret-form" onSubmit={submitSecret}>
                      <label htmlFor="secretInput">4 разные цифры</label>
                      <input
                        id="secretInput"
                        aria-label="Введите секретное число"
                        value={secretInput}
                        onChange={(event) => setSecretInput(normalizeDigits(event.target.value))}
                        placeholder="Например, 4831"
                        maxLength={4}
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      {secretValidationError ? <p className="error">{secretValidationError}</p> : null}
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
                  <section className="card fade-in" style={{ marginBottom: 14 }}>
                    <h2 className="section-title">Ваш ход</h2>
                    <form id="guess-form" onSubmit={submitGuess}>
                      <label htmlFor="guessInput">Попытка (4 разные цифры)</label>
                      <input
                        id="guessInput"
                        aria-label="Введите попытку"
                        value={guessInput}
                        onChange={(event) => setGuessInput(normalizeDigits(event.target.value))}
                        placeholder="Например, 9052"
                        maxLength={4}
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      {guessValidationError ? <p className="error">{guessValidationError}</p> : null}
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

                <section className="card fade-in" style={{ marginBottom: 14 }}>
                  <h2 className="section-title">Ходы игроков (раздельные окна)</h2>
                  <div className="split-turns">
                    <div className="mini-card">
                      <strong>Ваши ходы ({myTurns.length})</strong>
                      {myTurns.length ? (
                        <ul className="history">
                          {myTurns.map((turn) => (
                            <li key={`my-${turn.turnNo}`} className={turn.turnNo === latestTurnNo ? "last-turn animate-pop" : ""}>
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
                            <li key={`op-${turn.turnNo}`} className={turn.turnNo === latestTurnNo ? "last-turn animate-pop" : ""}>
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
                  <section className="card fade-in" style={{ marginBottom: 90 }}>
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
              <section className="card fade-in" style={{ marginBottom: 90 }}>
                <p>Ждем второго игрока. Отправьте другу код: {roomCode}</p>
              </section>
            )}
          </div>

          {mobileMenuOpen ? <button type="button" className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню" /> : null}

          <aside className={`room-side mobile-side ${mobileMenuOpen ? "open" : ""}`}>
            <UiControls />

            <section className="card fade-in" style={{ marginBottom: 14 }}>
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

            {roomState.settings.isHost ? (
              <section className="card fade-in" style={{ marginBottom: 14 }}>
                <h2 className="section-title">Режим хода</h2>
                <label>
                  Таймер
                  <select value={turnSecondsDraft ?? roomState.settings.turnSeconds} onChange={(event) => setTurnSecondsDraft(Number(event.target.value))}>
                    <option value={0}>Без таймера (классика)</option>
                    <option value={30}>30 секунд</option>
                    <option value={45}>45 секунд</option>
                    <option value={60}>60 секунд</option>
                  </select>
                </label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={saveTurnMode}
                    disabled={(turnSecondsDraft ?? roomState.settings.turnSeconds) === roomState.settings.turnSeconds}
                  >
                    Сохранить режим
                  </button>
                </div>
              </section>
            ) : null}

            <section className="card fade-in" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Мини-статистика комнаты</h2>
              <div className="status-grid">
                <div className="mini-card">
                  <strong>Раундов завершено</strong>
                  <span>{roomState.stats.finishedRounds}</span>
                </div>
                <div className="mini-card">
                  <strong>Среднее число ходов</strong>
                  <span>{roomState.stats.avgTurns}</span>
                </div>
                <div className="mini-card">
                  <strong>Победы Игрока 1</strong>
                  <span>{roomState.stats.seat1Wins}</span>
                </div>
                <div className="mini-card">
                  <strong>Победы Игрока 2</strong>
                  <span>{roomState.stats.seat2Wins}</span>
                </div>
              </div>
            </section>

            <section className="card fade-in" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Чат комнаты</h2>
              <ul className="chat-list" aria-live="polite">
                {roomState.chat.map((message) => (
                  <li key={message.id}>
                    <strong>{message.author}:</strong> {message.text}
                  </li>
                ))}
                {!roomState.chat.length ? <li className="hint">Пока сообщений нет.</li> : null}
              </ul>
              <form className="chat-form" onSubmit={submitChat}>
                <input
                  aria-label="Введите сообщение в чат"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value.slice(0, 300))}
                  placeholder="Напишите сообщение..."
                  maxLength={300}
                />
                <button type="submit" className="secondary" disabled={!chatInput.trim()}>
                  Отправить
                </button>
              </form>
            </section>
          </aside>
        </div>
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
