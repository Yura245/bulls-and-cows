"use client";

type SfxKind = "click" | "success" | "error" | "turn" | "win";
type SoundPack = "classic" | "arcade" | "soft";

const STORAGE_SOUND_ENABLED = "bac_sound_enabled";
const STORAGE_MUSIC_ENABLED = "bac_music_enabled";
const STORAGE_SOUND_PACK = "bac_sound_pack";

const MUSIC_TRACKS = ["/music/casap-akim-ok-pardon-slowed.mp3", "/music/new-jeans-jersey-club-remix-slowed.mp3"] as const;

let audioContext: AudioContext | null = null;
let musicAudio: HTMLAudioElement | null = null;
let musicTrackIndex = 0;

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

function ensureMusicElement(): HTMLAudioElement | null {
  if (!isBrowser()) return null;
  if (musicAudio) return musicAudio;

  const audio = new Audio();
  audio.preload = "none";
  audio.volume = 0.28;
  audio.addEventListener("ended", () => {
    musicTrackIndex = (musicTrackIndex + 1) % MUSIC_TRACKS.length;
    void playCurrentTrack();
  });
  audio.addEventListener("error", () => {
    musicTrackIndex = (musicTrackIndex + 1) % MUSIC_TRACKS.length;
    void playCurrentTrack();
  });

  musicAudio = audio;
  return musicAudio;
}

async function playCurrentTrack() {
  if (!getMusicEnabled()) return;
  const audio = ensureMusicElement();
  if (!audio) return;
  if (!MUSIC_TRACKS.length) return;

  const nextSrc = MUSIC_TRACKS[musicTrackIndex];
  if (!audio.src || !audio.src.endsWith(nextSrc)) {
    audio.src = nextSrc;
  }

  try {
    await audio.play();
  } catch {
    // Browser may block autoplay until user gesture.
  }
}

function stopMusic() {
  if (!musicAudio) return;
  musicAudio.pause();
  musicAudio.currentTime = 0;
}

export function playSfx(kind: SfxKind) {
  if (!getSoundEnabled()) return;
  const pack = getSoundPack();
  if (pack === "arcade") {
    playPatternArcade(kind);
  } else if (pack === "soft") {
    playPatternSoft(kind);
  } else {
    playPatternClassic(kind);
  }

  if (getMusicEnabled()) {
    void playCurrentTrack();
  }
}

export function syncMusicEngine() {
  if (!isBrowser()) return;

  if (!getMusicEnabled()) {
    stopMusic();
    return;
  }

  void playCurrentTrack();
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
