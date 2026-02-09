"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ToastRegion } from "@/components/toast-region";
import { UiControls } from "@/components/ui-controls";
import { parseJsonResponse } from "@/lib/browser-auth";
import type { RoomStateDto } from "@/lib/dto";
import { useToastQueue } from "@/lib/use-toast-queue";

type Props = {
  code: string;
  spectatorKey: string;
};

type TurnItem = NonNullable<RoomStateDto["game"]>["history"][number];

function buildStatusText(state: RoomStateDto | null): string {
  if (!state?.game) return "Ожидание игроков";
  if (state.game.status === "waiting_secrets") return "Игроки задают секреты";
  if (state.game.status === "active") return `Ход игрока ${state.game.turnSeat}`;
  return "Матч завершен";
}

export function WatchPage({ code, spectatorKey }: Props) {
  const [state, setState] = useState<RoomStateDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toasts, pushToast, removeToast } = useToastQueue();

  const roomCode = code.toUpperCase();

  const fetchState = useCallback(async () => {
    const response = await fetch(`/api/watch/${roomCode}/state?key=${encodeURIComponent(spectatorKey)}`);
    const payload = await parseJsonResponse<RoomStateDto>(response);
    setState(payload);
    return payload;
  }, [roomCode, spectatorKey]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        await fetchState();
      } catch (watchError) {
        if (!active) return;
        const message = watchError instanceof Error ? watchError.message : "Не удалось загрузить комнату наблюдения.";
        setError(message);
        pushToast(message, "error");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [fetchState, pushToast]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchState().catch(() => null);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [fetchState]);

  const turns1 = useMemo(() => {
    if (!state?.game) return [] as TurnItem[];
    return state.game.history.filter((turn) => turn.guesserSeat === 1);
  }, [state]);

  const turns2 = useMemo(() => {
    if (!state?.game) return [] as TurnItem[];
    return state.game.history.filter((turn) => turn.guesserSeat === 2);
  }, [state]);

  if (loading) {
    return (
      <main className="page-wrap">
        <p>Загружаем режим наблюдения...</p>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <ToastRegion toasts={toasts} onDismiss={removeToast} />

      <div style={{ marginBottom: 10 }}>
        <Link href="/">На главную</Link>
      </div>

      <section className="hero">
        <h1>Наблюдение за комнатой {roomCode}</h1>
        <p>
          Режим: <span className="badge">read-only spectator</span> Статус: <span className="badge">{buildStatusText(state)}</span>
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

      {state ? (
        <div className="room-layout">
          <div className="room-main">
            <section className="card" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Ходы игроков</h2>
              <div className="split-turns">
                <div className="mini-card">
                  <strong>Игрок 1 ({turns1.length})</strong>
                  <ul className="history">
                    {turns1.map((turn) => (
                      <li key={`s1-${turn.turnNo}`}>
                        #{turn.turnNo}: {turn.guess} {"->"} {turn.bulls}Б / {turn.cows}К
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mini-card">
                  <strong>Игрок 2 ({turns2.length})</strong>
                  <ul className="history">
                    {turns2.map((turn) => (
                      <li key={`s2-${turn.turnNo}`}>
                        #{turn.turnNo}: {turn.guess} {"->"} {turn.bulls}Б / {turn.cows}К
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
          {mobileMenuOpen ? <button type="button" className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню" /> : null}

          <aside className={`room-side mobile-side ${mobileMenuOpen ? "open" : ""}`}>
            <UiControls roomCode={roomCode} roomMusic={state.settings.music} spectatorKey={spectatorKey} />
            <section className="card" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Игроки</h2>
              <div className="players-grid">
                {state.players.map((player) => (
                  <div key={player.seat} className="mini-card">
                    <strong>
                      Игрок {player.seat}: {player.name}
                    </strong>
                    <span className={player.online ? "online" : "offline"}>{player.online ? "онлайн" : "не в сети"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Чат комнаты</h2>
              <ul className="chat-list">
                {state.chat.map((message) => (
                  <li key={message.id}>
                    <strong>{message.author}:</strong> {message.text}
                  </li>
                ))}
                {!state.chat.length ? <li className="hint">Пока сообщений нет.</li> : null}
              </ul>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
