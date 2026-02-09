import { ROOM_CODE_LENGTH } from "@/lib/constants";
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
