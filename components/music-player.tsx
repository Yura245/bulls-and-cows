"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { authorizedFetch, parseJsonResponse } from "@/lib/browser-auth";
import type { RoomStateDto } from "@/lib/dto";
import {
  addUploadedTracks,
  applySharedMusicState,
  clearSharedMusicState,
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

type SharedUploadResponse = {
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

async function uploadSharedTrack(roomCode: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", file.name.replace(/\.[a-z0-9]+$/i, ""));
  const response = await authorizedFetch(`/api/rooms/${roomCode}/music/upload`, {
    method: "POST",
    body: formData
  });
  return parseJsonResponse<SharedUploadResponse>(response);
}

export function MusicPlayer({ roomCode, roomMusic, spectatorKey }: Props) {
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const sharedMode = Boolean(roomCode && roomMusic);
  const canUploadShared = sharedMode && !spectatorKey;

  useEffect(() => {
    return subscribeMusicState((nextState) => {
      setMusicState(nextState);
    });
  }, []);

  useEffect(() => {
    if (!sharedMode || !roomMusic) {
      clearSharedMusicState();
      return;
    }
    applySharedMusicState(roomMusic);
  }, [sharedMode, roomMusic]);

  const currentTrackLabel = useMemo(() => {
    if (!musicState?.currentTrackTitle) {
      return "Трек не выбран";
    }
    return musicState.currentTrackTitle;
  }, [musicState]);

  const uploadedCount = useMemo(() => {
    if (sharedMode) {
      return roomMusic?.tracks.filter((track) => track.source === "uploaded").length ?? 0;
    }
    return musicState?.tracks.filter((track) => track.source === "uploaded").length ?? 0;
  }, [sharedMode, roomMusic?.tracks, musicState]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list || !list.length) return;
    const files = Array.from(list);
    event.target.value = "";

    if (!sharedMode) {
      const added = addUploadedTracks(files);
      if (!added) {
        setNote("Не удалось добавить треки. Выберите mp3/audio файлы.");
        playSfx("error");
      } else {
        setNote(`Добавлено треков: ${added}`);
        playSfx("success");
      }
      return;
    }

    if (!roomCode || !canUploadShared) {
      setNote("Добавлять треки в комнату могут только игроки.");
      playSfx("error");
      return;
    }

    setUploading(true);
    let added = 0;
    let latestMusic: RoomStateDto["settings"]["music"] | null = null;

    try {
      for (const file of files) {
        const payload = await uploadSharedTrack(roomCode, file);
        latestMusic = payload.music;
        added += 1;
      }
      if (latestMusic) {
        applySharedMusicState(latestMusic);
      }
      setNote(`Треков добавлено в комнату: ${added}`);
      playSfx("success");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не удалось загрузить треки в комнату.");
      playSfx("error");
    } finally {
      setUploading(false);
    }
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

      {sharedMode ? <p className="hint">Эти кнопки синхронизируют музыку у игроков и наблюдателей в комнате.</p> : null}

      <label className="music-upload">
        {sharedMode ? "Добавить трек в комнату" : "Загрузить свои треки"}
        <input type="file" accept="audio/*,.mp3" multiple onChange={handleUpload} disabled={uploading || (sharedMode && !canUploadShared)} />
      </label>

      {sharedMode ? (
        <p className="hint">
          {canUploadShared ? "Добавленные треки будут общими для всей комнаты." : "В режиме наблюдателя загрузка треков выключена."}
          {uploadedCount > 0 ? ` Загружено треков: ${uploadedCount}.` : ""}
        </p>
      ) : uploadedCount > 0 ? (
        <p className="hint">Локально загружено треков: {uploadedCount}.</p>
      ) : null}

      {note ? <p className="hint">{note}</p> : null}
    </div>
  );
}
