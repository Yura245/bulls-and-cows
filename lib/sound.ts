"use client";

type SfxKind = "click" | "success" | "error" | "turn" | "win";
type SoundPack = "classic" | "arcade" | "soft";

export type MusicTrack = {
  id: string;
  title: string;
  src: string;
  source: "builtin" | "uploaded";
};

export type MusicState = {
  enabled: boolean;
  playing: boolean;
  currentTrackId: string | null;
  currentTrackTitle: string | null;
  tracks: MusicTrack[];
};

const STORAGE_SOUND_ENABLED = "bac_sound_enabled";
const STORAGE_MUSIC_ENABLED = "bac_music_enabled";
const STORAGE_SOUND_PACK = "bac_sound_pack";

const BUILTIN_TRACKS: MusicTrack[] = [
  {
    id: "builtin-casap",
    title: "Casap - AKIM OK PARDON (Slowed)",
    src: "/music/casap-akim-ok-pardon-slowed.mp3",
    source: "builtin"
  },
  {
    id: "builtin-jersey",
    title: "jersey_kub - new jeans jersey club remix 2 (Slowed)",
    src: "/music/new-jeans-jersey-club-remix-slowed.mp3",
    source: "builtin"
  }
];

let audioContext: AudioContext | null = null;
let musicAudio: HTMLAudioElement | null = null;
let musicTrackIndex = 0;
let uploadedTracks: MusicTrack[] = [];
let uploadedObjectUrls: string[] = [];

const listeners = new Set<(state: MusicState) => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getAllTracks(): MusicTrack[] {
  return [...BUILTIN_TRACKS, ...uploadedTracks];
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

function buildMusicState(): MusicState {
  const tracks = getAllTracks();
  const track = tracks[musicTrackIndex] ?? null;
  return {
    enabled: getMusicEnabled(),
    playing: Boolean(musicAudio && !musicAudio.paused),
    currentTrackId: track?.id ?? null,
    currentTrackTitle: track?.title ?? null,
    tracks
  };
}

function notifyMusicState() {
  const state = buildMusicState();
  listeners.forEach((listener) => listener(state));
}

function ensureContext(): AudioContext | null {
  if (!isBrowser()) return null;
  if (audioContext) return audioContext;

  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  audioContext = new Ctx();
  return audioContext;
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
  audio.preload = "metadata";
  audio.volume = 0.28;
  audio.addEventListener("play", notifyMusicState);
  audio.addEventListener("pause", notifyMusicState);
  audio.addEventListener("ended", () => {
    void nextMusicTrack();
  });
  audio.addEventListener("error", () => {
    void nextMusicTrack();
  });

  musicAudio = audio;
  return musicAudio;
}

async function playCurrentTrack(forceReload = false): Promise<boolean> {
  if (!getMusicEnabled()) return false;
  const audio = ensureMusicElement();
  if (!audio) return false;

  const tracks = getAllTracks();
  if (!tracks.length) return false;
  if (musicTrackIndex >= tracks.length) {
    musicTrackIndex = 0;
  }

  const track = tracks[musicTrackIndex];
  if (!track) return false;

  if (forceReload || !audio.src || !audio.src.endsWith(track.src)) {
    audio.src = track.src;
    audio.currentTime = 0;
  }

  try {
    await audio.play();
    notifyMusicState();
    return true;
  } catch {
    notifyMusicState();
    return false;
  }
}

function stopMusic() {
  if (!musicAudio) return;
  musicAudio.pause();
  musicAudio.currentTime = 0;
  notifyMusicState();
}

export function subscribeMusicState(listener: (state: MusicState) => void): () => void {
  listeners.add(listener);
  listener(buildMusicState());
  return () => {
    listeners.delete(listener);
  };
}

export function addUploadedTracks(files: File[]): number {
  if (!isBrowser() || !files.length) return 0;

  const accepted = files.filter((file) => file.type.startsWith("audio/") || file.name.toLowerCase().endsWith(".mp3"));
  if (!accepted.length) return 0;

  const nextTracks = accepted.map((file, index) => {
    const src = URL.createObjectURL(file);
    uploadedObjectUrls.push(src);
    return {
      id: `upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      title: file.name.replace(/\.[a-z0-9]+$/i, ""),
      src,
      source: "uploaded" as const
    };
  });

  uploadedTracks = [...uploadedTracks, ...nextTracks];
  notifyMusicState();
  return nextTracks.length;
}

export async function toggleMusicPlayback(): Promise<boolean> {
  const audio = ensureMusicElement();
  if (!audio) return false;

  if (audio.paused) {
    if (!getMusicEnabled()) {
      if (isBrowser()) {
        window.localStorage.setItem(STORAGE_MUSIC_ENABLED, "1");
      }
    }
    const started = await playCurrentTrack();
    notifyMusicState();
    return started;
  }

  audio.pause();
  notifyMusicState();
  return true;
}

export async function nextMusicTrack(): Promise<boolean> {
  const tracks = getAllTracks();
  if (!tracks.length) return false;
  musicTrackIndex = (musicTrackIndex + 1) % tracks.length;
  const started = await playCurrentTrack(true);
  notifyMusicState();
  return started;
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
  notifyMusicState();
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

export function disposeUploadedTracks() {
  uploadedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  uploadedObjectUrls = [];
  uploadedTracks = [];
  musicTrackIndex = 0;
  notifyMusicState();
}
