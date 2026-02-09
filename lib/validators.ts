import { ROOM_CODE_LENGTH, SHARED_MUSIC_TRACKS, TURN_SECONDS_OPTIONS } from "@/lib/constants";
import { HttpError } from "@/lib/errors";

const NUMBER_4_NO_REPEAT_REGEX = /^\d{4}$/;
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

function hasUniqueDigits(value: string): boolean {
  return new Set(value.split("")).size === value.length;
}

export function ensureDisplayName(value: unknown): string {
  const displayName = typeof value === "string" ? value.trim() : "";
  if (!displayName) {
    throw new HttpError(400, "INVALID_DISPLAY_NAME", "Введите имя игрока.");
  }
  if (displayName.length > 24) {
    throw new HttpError(400, "INVALID_DISPLAY_NAME", "Имя слишком длинное (максимум 24 символа).");
  }
  return displayName;
}

export function normalizeRoomCode(value: unknown): string {
  const roomCode = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (roomCode.length !== ROOM_CODE_LENGTH || !ROOM_CODE_REGEX.test(roomCode)) {
    throw new HttpError(400, "INVALID_ROOM_CODE", "Код комнаты должен содержать 6 символов A-Z или 0-9.");
  }
  return roomCode;
}

export function ensureFourDigitsNoRepeats(value: unknown, errorCode: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!NUMBER_4_NO_REPEAT_REGEX.test(normalized) || !hasUniqueDigits(normalized)) {
    throw new HttpError(400, errorCode, "Нужно ввести 4 разные цифры.");
  }
  return normalized;
}

export function ensureTurnSeconds(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || !TURN_SECONDS_OPTIONS.includes(numeric as (typeof TURN_SECONDS_OPTIONS)[number])) {
    throw new HttpError(400, "INVALID_TURN_SECONDS", "Разрешены режимы: без таймера, 30с, 45с, 60с.");
  }
  return numeric;
}

export function ensureChatMessage(value: unknown): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) {
    throw new HttpError(400, "INVALID_CHAT_MESSAGE", "Сообщение не может быть пустым.");
  }
  if (message.length > 300) {
    throw new HttpError(400, "INVALID_CHAT_MESSAGE", "Сообщение слишком длинное (максимум 300 символов).");
  }
  return message;
}

export function ensureMusicAction(value: unknown): "toggle" | "next" {
  const action = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (action !== "toggle" && action !== "next") {
    throw new HttpError(400, "INVALID_MUSIC_ACTION", "Поддерживаются действия: toggle, next.");
  }
  return action;
}

export function normalizeTrackIndex(value: number, trackCount: number = SHARED_MUSIC_TRACKS.length): number {
  if (trackCount <= 0) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safe = Math.floor(value);
  return ((safe % trackCount) + trackCount) % trackCount;
}
