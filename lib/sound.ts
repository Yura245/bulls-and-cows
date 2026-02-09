"use client";

type SfxKind = "click" | "success" | "error" | "turn" | "win";
type SoundPack = "classic" | "arcade" | "soft";

const STORAGE_SOUND_ENABLED = "bac_sound_enabled";
const STORAGE_MUSIC_ENABLED = "bac_music_enabled";
const STORAGE_SOUND_PACK = "bac_sound_pack";

let audioContext: AudioContext | null = null;
let musicTimer: number | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function ensureContext(): AudioContext | null {
  if (!isBrowser()) return null;
  if (audioContext) return audioContext;

  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  audioContext = new Ctx();
  return audioContext;
}

function getSoundEnabled(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(STORAGE_SOUND_ENABLED) !== "0";
}

function getMusicEnabled(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(STORAGE_MUSIC_ENABLED) === "1";
}

function getSoundPack(): SoundPack {
  if (!isBrowser()) return "classic";
  const value = window.localStorage.getItem(STORAGE_SOUND_PACK);
  if (value === "arcade" || value === "soft") {
    return value;
  }
  return "classic";
}

function playTone(frequency: number, durationMs: number, type: OscillatorType, volume = 0.05) {
  const ctx = ensureContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + durationMs / 1000);
}

function playPatternClassic(kind: SfxKind) {
  switch (kind) {
    case "click":
      playTone(420, 60, "triangle");
      break;
    case "success":
      playTone(520, 90, "triangle");
      setTimeout(() => playTone(660, 120, "triangle"), 70);
      break;
    case "error":
      playTone(180, 160, "sawtooth");
      break;
    case "turn":
      playTone(720, 80, "square");
      break;
    case "win":
      playTone(520, 110, "triangle");
      setTimeout(() => playTone(660, 110, "triangle"), 90);
      setTimeout(() => playTone(820, 140, "triangle"), 180);
      break;
  }
}

function playPatternArcade(kind: SfxKind) {
  switch (kind) {
    case "click":
      playTone(640, 50, "square");
      break;
    case "success":
      playTone(780, 80, "square");
      setTimeout(() => playTone(980, 100, "square"), 70);
      break;
    case "error":
      playTone(140, 180, "square");
      break;
    case "turn":
      playTone(900, 70, "square");
      break;
    case "win":
      playTone(700, 80, "square");
      setTimeout(() => playTone(920, 80, "square"), 70);
      setTimeout(() => playTone(1150, 120, "square"), 150);
      break;
  }
}

function playPatternSoft(kind: SfxKind) {
  switch (kind) {
    case "click":
      playTone(360, 80, "sine", 0.035);
      break;
    case "success":
      playTone(420, 120, "sine", 0.04);
      setTimeout(() => playTone(520, 140, "sine", 0.04), 90);
      break;
    case "error":
      playTone(200, 180, "triangle", 0.04);
      break;
    case "turn":
      playTone(560, 100, "sine", 0.04);
      break;
    case "win":
      playTone(420, 130, "sine", 0.045);
      setTimeout(() => playTone(560, 130, "sine", 0.045), 100);
      setTimeout(() => playTone(680, 170, "sine", 0.045), 200);
      break;
  }
}

export function playSfx(kind: SfxKind) {
  if (!getSoundEnabled()) return;
  const pack = getSoundPack();
  if (pack === "arcade") {
    playPatternArcade(kind);
    return;
  }
  if (pack === "soft") {
    playPatternSoft(kind);
    return;
  }
  playPatternClassic(kind);
}

function playMusicTick() {
  const pack = getSoundPack();
  if (pack === "arcade") {
    playTone(260, 130, "square", 0.02);
    setTimeout(() => playTone(330, 100, "square", 0.015), 180);
    return;
  }
  if (pack === "soft") {
    playTone(220, 180, "sine", 0.012);
    setTimeout(() => playTone(277, 150, "sine", 0.012), 240);
    return;
  }
  playTone(246, 140, "triangle", 0.016);
  setTimeout(() => playTone(311, 130, "triangle", 0.016), 210);
}

export function syncMusicEngine() {
  if (!isBrowser()) return;

  if (!getMusicEnabled()) {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
    return;
  }

  if (musicTimer !== null) {
    return;
  }

  playMusicTick();
  musicTimer = window.setInterval(playMusicTick, 2600);
}

export function persistSoundPrefs(options: { soundEnabled: boolean; musicEnabled: boolean; soundPack: SoundPack }) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_SOUND_ENABLED, options.soundEnabled ? "1" : "0");
  window.localStorage.setItem(STORAGE_MUSIC_ENABLED, options.musicEnabled ? "1" : "0");
  window.localStorage.setItem(STORAGE_SOUND_PACK, options.soundPack);
  syncMusicEngine();
}

export function readSoundPrefs(): { soundEnabled: boolean; musicEnabled: boolean; soundPack: SoundPack } {
  if (!isBrowser()) {
    return {
      soundEnabled: true,
      musicEnabled: false,
      soundPack: "classic"
    };
  }

  const soundEnabled = window.localStorage.getItem(STORAGE_SOUND_ENABLED) !== "0";
  const musicEnabled = window.localStorage.getItem(STORAGE_MUSIC_ENABLED) === "1";
  const soundPack = getSoundPack();

  return {
    soundEnabled,
    musicEnabled,
    soundPack
  };
}
