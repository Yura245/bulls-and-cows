"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { authorizedFetch, parseJsonResponse } from "@/lib/browser-auth";
import type { RoomStateDto } from "@/lib/dto";
import {
  addUploadedTracks,
  applySharedMusicState,
  nextMusicTrack,
  playSfx,
  subscribeMusicState,
  toggleMusicPlayback,
  type MusicState
} from "@/lib/sound";

type Props = {
  roomCode?: string;
  roomMusic?: RoomStateDto["settings"]["music"] | null;
  spectatorKey?: string;
};

type SharedMusicResponse = {
  ok: boolean;
  music: RoomStateDto["settings"]["music"];
};

async function postSharedAction(roomCode: string, action: "toggle" | "next", spectatorKey?: string) {
  const body: Record<string, unknown> = { action };
  if (spectatorKey) {
    body.spectatorKey = spectatorKey;
  }

  const response = spectatorKey
    ? await fetch(`/api/rooms/${roomCode}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    : await authorizedFetch(`/api/rooms/${roomCode}/music`, {
        method: "POST",
        body: JSON.stringify(body)
      });

  return parseJsonResponse<SharedMusicResponse>(response);
}

export function MusicPlayer({ roomCode, roomMusic, spectatorKey }: Props) {
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [note, setNote] = useState("");
  const sharedMode = Boolean(roomCode && roomMusic);

  useEffect(() => {
    return subscribeMusicState((nextState) => {
      setMusicState(nextState);
    });
  }, []);

  useEffect(() => {
    if (!sharedMode || !roomMusic) return;
    applySharedMusicState(roomMusic);
  }, [sharedMode, roomMusic?.trackIndex, roomMusic?.isPlaying, roomMusic?.startedAt, roomMusic?.updatedAt, roomMusic]);

  const currentTrackLabel = useMemo(() => {
    if (!musicState?.currentTrackTitle) {
      return "Трек не выбран";
    }
    return musicState.currentTrackTitle;
  }, [musicState]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list || !list.length) return;

    const files = Array.from(list);
    const added = addUploadedTracks(files);
    if (!added) {
      setNote("Не удалось добавить треки. Выберите mp3/audio файлы.");
      playSfx("error");
    } else {
      setNote(`Добавлено треков: ${added}`);
      playSfx("success");
    }
    event.target.value = "";
  };

  const handleLocalToggle = async () => {
    const ok = await toggleMusicPlayback();
    playSfx(ok ? "click" : "error");
  };

  const handleLocalNext = async () => {
    const ok = await nextMusicTrack();
    playSfx(ok ? "click" : "error");
  };

  const handleSharedToggle = async () => {
    if (!roomCode) return;
    try {
      const payload = await postSharedAction(roomCode, "toggle", spectatorKey);
      applySharedMusicState(payload.music);
      playSfx("click");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не удалось обновить музыку комнаты.");
      playSfx("error");
    }
  };

  const handleSharedNext = async () => {
    if (!roomCode) return;
    try {
      const payload = await postSharedAction(roomCode, "next", spectatorKey);
      applySharedMusicState(payload.music);
      playSfx("click");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не удалось переключить трек комнаты.");
      playSfx("error");
    }
  };

  const isPlaying = sharedMode ? Boolean(roomMusic?.isPlaying) : Boolean(musicState?.playing);

  return (
    <div className="music-player">
      <strong className="music-player-title">{sharedMode ? "Общая музыка комнаты" : "Плеер"}</strong>
      <p className="hint" style={{ marginTop: 4 }}>
        Сейчас: {currentTrackLabel}
      </p>
      <div className="music-actions">
        <button type="button" className="secondary" onClick={sharedMode ? handleSharedToggle : handleLocalToggle}>
          {isPlaying ? "Пауза" : "Плей"}
        </button>
        <button type="button" className="ghost" onClick={sharedMode ? handleSharedNext : handleLocalNext}>
          Следующий
        </button>
      </div>
      {sharedMode ? (
        <p className="hint">Кнопки управляют музыкой сразу у игроков и наблюдателей.</p>
      ) : (
        <label className="music-upload">
          Загрузить свои треки
          <input type="file" accept="audio/*,.mp3" multiple onChange={handleUpload} />
        </label>
      )}
      {note ? <p className="hint">{note}</p> : null}
    </div>
  );
}
