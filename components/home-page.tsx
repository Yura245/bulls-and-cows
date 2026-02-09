"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { authorizedFetch, ensureAnonymousSession, parseJsonResponse } from "@/lib/browser-auth";

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

  useEffect(() => {
    const cachedName = window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    setDisplayName(cachedName);
    const urlCode = normalizeRoomCode(new URLSearchParams(window.location.search).get("code") ?? "");
    if (urlCode) {
      setRoomCode(urlCode);
    }

    void ensureAnonymousSession().catch((sessionError) => {
      setError(sessionError instanceof Error ? sessionError.message : "Не удалось открыть игровую сессию.");
    });
  }, []);

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
      router.push(`/room/${payload.roomCode}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать комнату.");
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
      router.push(`/room/${normalizedCode}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Не удалось войти в комнату.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-wrap">
      <section className="hero">
        <h1>Быки и коровы онлайн</h1>
        <p>Создай комнату, отправь код другу и играйте в реальном времени из разных городов.</p>
      </section>

      <div className="row">
        <section className="card col">
          <h2 className="section-title">1. Имя игрока</h2>
          <label htmlFor="displayName">Имя</label>
          <input
            id="displayName"
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
            <button disabled={busy || !displayName.trim()} type="submit">
              Создать комнату
            </button>
          </form>

          <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--border)" }} />

          <form onSubmit={handleJoin}>
            <label htmlFor="roomCode">Код комнаты</label>
            <input
              id="roomCode"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              placeholder="Например, AB12CD"
              maxLength={6}
            />
            <div style={{ marginTop: 10 }}>
              <button className="secondary" disabled={busy || !displayName.trim() || roomCode.length !== 6} type="submit">
                Войти по коду
              </button>
            </div>
          </form>

          <p className="hint">Совет: проще отправлять другу ссылку комнаты изнутри игры.</p>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
