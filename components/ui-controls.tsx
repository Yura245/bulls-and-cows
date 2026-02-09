"use client";

import { useEffect, useState } from "react";

import { MusicPlayer } from "@/components/music-player";
import { persistSoundPrefs, playSfx, readSoundPrefs, syncMusicEngine } from "@/lib/sound";

type Theme = "light" | "dark";
type Skin = "classic" | "forest" | "space" | "pixel" | "seasonal";
type SoundPack = "classic" | "arcade" | "soft";

const STORAGE_THEME = "bac_theme";
const STORAGE_SKIN = "bac_skin";
const STORAGE_CONTRAST = "bac_high_contrast";

function applyUi(theme: Theme, skin: Skin, contrast: boolean) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-skin", skin);
  root.setAttribute("data-contrast", contrast ? "high" : "normal");
}

export function UiControls() {
  const [theme, setTheme] = useState<Theme>("light");
  const [skin, setSkin] = useState<Skin>("classic");
  const [highContrast, setHighContrast] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [soundPack, setSoundPack] = useState<SoundPack>("classic");

  useEffect(() => {
    const storedTheme = (window.localStorage.getItem(STORAGE_THEME) as Theme | null) ?? "light";
    const storedSkin = (window.localStorage.getItem(STORAGE_SKIN) as Skin | null) ?? "classic";
    const storedContrast = window.localStorage.getItem(STORAGE_CONTRAST) === "1";
    const audio = readSoundPrefs();

    setTheme(storedTheme);
    setSkin(storedSkin);
    setHighContrast(storedContrast);
    setSoundEnabled(audio.soundEnabled);
    setMusicEnabled(audio.musicEnabled);
    setSoundPack(audio.soundPack);
    applyUi(storedTheme, storedSkin, storedContrast);
    syncMusicEngine();
  }, []);

  useEffect(() => {
    applyUi(theme, skin, highContrast);
    window.localStorage.setItem(STORAGE_THEME, theme);
    window.localStorage.setItem(STORAGE_SKIN, skin);
    window.localStorage.setItem(STORAGE_CONTRAST, highContrast ? "1" : "0");
  }, [theme, skin, highContrast]);

  useEffect(() => {
    persistSoundPrefs({
      soundEnabled,
      musicEnabled,
      soundPack
    });
  }, [soundEnabled, musicEnabled, soundPack]);

  return (
    <section className="card ui-controls-card" aria-label="Настройки интерфейса">
      <h2 className="section-title">Вид и звук</h2>
      <div className="ui-controls-grid">
        <label>
          Тема
          <select
            value={theme}
            onChange={(event) => {
              setTheme(event.target.value as Theme);
              playSfx("click");
            }}
          >
            <option value="light">Светлая</option>
            <option value="dark">Темная</option>
          </select>
        </label>
        <label>
          Скин
          <select
            value={skin}
            onChange={(event) => {
              setSkin(event.target.value as Skin);
              playSfx("click");
            }}
          >
            <option value="classic">Классический</option>
            <option value="forest">Лесной</option>
            <option value="space">Космический</option>
            <option value="pixel">Пиксельный</option>
            <option value="seasonal">Сезонный</option>
          </select>
        </label>
        <label>
          Звуковой пак
          <select
            value={soundPack}
            onChange={(event) => {
              setSoundPack(event.target.value as SoundPack);
              playSfx("click");
            }}
          >
            <option value="classic">Classic</option>
            <option value="arcade">Arcade</option>
            <option value="soft">Soft</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(event) => {
              setHighContrast(event.target.checked);
              playSfx("click");
            }}
          />
          Высокая контрастность
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) => {
              setSoundEnabled(event.target.checked);
              playSfx("click");
            }}
          />
          Звуковые эффекты
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={musicEnabled}
            onChange={(event) => {
              setMusicEnabled(event.target.checked);
              playSfx("click");
            }}
          />
          Фоновая музыка
        </label>
      </div>

      <MusicPlayer />
    </section>
  );
}
