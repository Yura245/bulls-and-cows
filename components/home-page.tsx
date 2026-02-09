"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { SocialSummary } from "@/components/social-summary";
import { ToastRegion } from "@/components/toast-region";
import { UiControls } from "@/components/ui-controls";
import { authorizedFetch, ensureAnonymousSession, parseJsonResponse } from "@/lib/browser-auth";
import { getFriends, getMatchHistory } from "@/lib/local-social";
import { playSfx } from "@/lib/sound";
import { useToastQueue } from "@/lib/use-toast-queue";

const NAME_STORAGE_KEY = "bac_display_name";

type CreateRoomResponse = {
  roomCode: string;
  roomId: string;
  seat: 1;
};

type JoinRoomResponse = {
  roomId: string;
  seat: 1 | 2;
};

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [friends, setFriends] = useState(() => getFriends());
  const [matches, setMatches] = useState(() => getMatchHistory());
  const { toasts, pushToast, removeToast } = useToastQueue();

  useEffect(() => {
    const cachedName = window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    setDisplayName(cachedName);
    const urlCode = normalizeRoomCode(new URLSearchParams(window.location.search).get("code") ?? "");
    if (urlCode) {
      setRoomCode(urlCode);
    }

    setFriends(getFriends());
    setMatches(getMatchHistory());

    void ensureAnonymousSession().catch((sessionError) => {
      const message = sessionError instanceof Error ? sessionError.message : "Не удалось открыть игровую сессию.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    });
  }, [pushToast]);

  const persistName = (name: string) => {
    window.localStorage.setItem(NAME_STORAGE_KEY, name);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      persistName(displayName);
      const response = await authorizedFetch("/api/rooms/create", {
        method: "POST",
        body: JSON.stringify({ displayName })
      });
      const payload = await parseJsonResponse<CreateRoomResponse>(response);
      playSfx("success");
      pushToast(`Комната ${payload.roomCode} создана`, "success");
      router.push(`/room/${payload.roomCode}`);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Не удалось создать комнату.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      persistName(displayName);
      const normalizedCode = normalizeRoomCode(roomCode);
      const response = await authorizedFetch("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          roomCode: normalizedCode
        })
      });
      await parseJsonResponse<JoinRoomResponse>(response);
      playSfx("success");
      pushToast(`Подключение к комнате ${normalizedCode}`, "success");
      router.push(`/room/${normalizedCode}`);
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : "Не удалось войти в комнату.";
      setError(message);
      pushToast(message, "error");
      playSfx("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-wrap">
      <a href="#main-content" className="skip-link">
        Перейти к основному контенту
      </a>

      <ToastRegion toasts={toasts} onDismiss={removeToast} />

      <section className="hero" id="main-content">
        <h1>Быки и коровы онлайн</h1>
        <p>Создай комнату, отправь код другу и играйте в реальном времени из разных городов.</p>
      </section>

      <UiControls />

      <div className="row">
        <section className="card col">
          <h2 className="section-title">1. Имя игрока</h2>
          <label htmlFor="displayName">Имя</label>
          <input
            id="displayName"
            aria-label="Введите имя игрока"
            maxLength={24}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Например, Юра"
          />
          <p className="hint">Имя видит соперник. После входа оно запоминается на устройстве.</p>
        </section>

        <section className="card col">
          <h2 className="section-title">2. Начать игру</h2>
          <form onSubmit={handleCreate}>
            <button aria-label="Создать новую комнату" disabled={busy || !displayName.trim()} type="submit">
              Создать комнату
            </button>
          </form>

          <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--border)" }} />

          <form onSubmit={handleJoin}>
            <label htmlFor="roomCode">Код комнаты</label>
            <input
              id="roomCode"
              aria-label="Введите код комнаты"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              placeholder="Например, AB12CD"
              maxLength={6}
            />
            <div style={{ marginTop: 10 }}>
              <button
                aria-label="Войти в комнату по коду"
                className="secondary"
                disabled={busy || !displayName.trim() || roomCode.length !== 6}
                type="submit"
              >
                Войти по коду
              </button>
            </div>
          </form>

          <p className="hint">Совет: после создания лучше делиться ссылкой комнаты, а не вручную кодом.</p>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </div>

      <SocialSummary friends={friends} matches={matches} />
    </main>
  );
}
