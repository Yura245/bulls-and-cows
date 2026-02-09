"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { addUploadedTracks, nextMusicTrack, playSfx, subscribeMusicState, toggleMusicPlayback, type MusicState } from "@/lib/sound";

export function MusicPlayer() {
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    return subscribeMusicState((nextState) => {
      setMusicState(nextState);
    });
  }, []);

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

  const handleToggle = async () => {
    const ok = await toggleMusicPlayback();
    playSfx(ok ? "click" : "error");
  };

  const handleNext = async () => {
    const ok = await nextMusicTrack();
    playSfx(ok ? "click" : "error");
  };

  return (
    <div className="music-player">
      <strong className="music-player-title">Плеер</strong>
      <p className="hint" style={{ marginTop: 4 }}>
        Сейчас: {currentTrackLabel}
      </p>
      <div className="music-actions">
        <button type="button" className="secondary" onClick={handleToggle}>
          {musicState?.playing ? "Пауза" : "Плей"}
        </button>
        <button type="button" className="ghost" onClick={handleNext}>
          Следующий
        </button>
      </div>
      <label className="music-upload">
        Загрузить свои треки
        <input type="file" accept="audio/*,.mp3" multiple onChange={handleUpload} />
      </label>
      {note ? <p className="hint">{note}</p> : null}
    </div>
  );
}
