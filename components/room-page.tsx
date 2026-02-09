"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { authorizedFetch, parseJsonResponse } from "@/lib/browser-auth";
import type { RoomStateDto } from "@/lib/dto";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const NAME_STORAGE_KEY = "bac_display_name";

type Props = {
  code: string;
};

function gameStatusText(state: RoomStateDto | null): string {
  if (!state?.game) {
    return "Ожидание второго игрока";
  }
  if (state.game.status === "waiting_secrets") {
    return "Игроки задают секретные числа";
  }
  if (state.game.status === "active") {
    return state.game.turnSeat === state.game.mySeat ? "Ваш ход" : "Ход соперника";
  }
  if (state.game.status === "finished") {
    return state.game.winnerSeat === state.game.mySeat ? "Вы победили" : "Вы проиграли";
  }
  return "Неизвестный статус";
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

  const roomCode = code.toUpperCase();

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

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        await ensureJoined();
        if (!active) return;
        await fetchState();
      } catch (joinError) {
        if (!active) return;
        setError(joinError instanceof Error ? joinError.message : "Не удалось подключиться к комнате.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [ensureJoined, fetchState]);

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
        setRealtimeReady(status === "SUBSCRIBED");
      });

    return () => {
      setRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [roomState?.roomId, fetchState]);

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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка голосования за реванш.");
    } finally {
      setBusy(false);
    }
  };

  const canSetSecret = useMemo(() => {
    return Boolean(roomState?.game && roomState.game.status === "waiting_secrets" && !roomState.game.mySecretSet);
  }, [roomState]);

  const canGuess = useMemo(() => {
    return Boolean(roomState?.game && roomState.game.status === "active" && roomState.game.turnSeat === roomState.game.mySeat);
  }, [roomState]);

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
          <span className="hint">{realtimeReady ? "Realtime подключен" : "Realtime недоступен, работает polling"}</span>
        </p>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="section-title">Игроки</h2>
        <div className="players-grid">
          {roomState?.players.map((player) => (
            <div className="mini-card" key={player.seat}>
              <strong>
                Игрок {player.seat}: {player.name}
              </strong>
              <span className={player.online ? "online" : "offline"}>{player.online ? "онлайн" : "не в сети"}</span>
            </div>
          ))}
        </div>
      </section>

      {roomState?.game ? (
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
              <form onSubmit={submitSecret}>
                <label htmlFor="secretInput">4 разные цифры</label>
                <input
                  id="secretInput"
                  value={secretInput}
                  onChange={(event) => setSecretInput(event.target.value)}
                  placeholder="Например, 4831"
                  maxLength={4}
                />
                <div style={{ marginTop: 10 }}>
                  <button disabled={busy || secretInput.length !== 4} type="submit">
                    Сохранить секрет
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {canGuess ? (
            <section className="card" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Ваш ход</h2>
              <form onSubmit={submitGuess}>
                <label htmlFor="guessInput">Попытка (4 разные цифры)</label>
                <input
                  id="guessInput"
                  value={guessInput}
                  onChange={(event) => setGuessInput(event.target.value)}
                  placeholder="Например, 9052"
                  maxLength={4}
                />
                <div style={{ marginTop: 10 }}>
                  <button className="secondary" disabled={busy || guessInput.length !== 4} type="submit">
                    Отправить ход
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="card" style={{ marginBottom: 14 }}>
            <h2 className="section-title">История ходов</h2>
            {roomState.game.history.length ? (
              <ul className="history">
                {roomState.game.history.map((turn) => (
                  <li key={`${turn.turnNo}-${turn.guesserSeat}`}>
                    #{turn.turnNo} Игрок {turn.guesserSeat}: {turn.guess} {"->"} {turn.bulls}Б / {turn.cows}К
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Пока нет ходов.</p>
            )}
          </section>

          {roomState.game.status === "finished" ? (
            <section className="card">
              <h2 className="section-title">Реванш</h2>
              <p className="hint">
                Голоса: Игрок 1 {roomState.game.rematchVotes.seat1 ? "готов" : "ждет"} / Игрок 2{" "}
                {roomState.game.rematchVotes.seat2 ? "готов" : "ждет"}
              </p>
              <button className="ghost" disabled={busy} onClick={submitRematchVote} type="button">
                Хочу реванш
              </button>
            </section>
          ) : null}
        </>
      ) : (
        <section className="card">
          <p>Ждем второго игрока. Отправьте код комнаты другу: {roomCode}</p>
        </section>
      )}
    </main>
  );
}
