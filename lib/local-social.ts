"use client";

export type FriendEntry = {
  name: string;
  lastPlayedAt: string;
};

export type MatchEntry = {
  gameId: string;
  roomCode: string;
  opponentName: string;
  result: "win" | "lose";
  turns: number;
  finishedAt: string;
};

const STORAGE_FRIENDS = "bac_friends";
const STORAGE_MATCH_HISTORY = "bac_match_history";

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isFriendEntry(value: unknown): value is FriendEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "lastPlayedAt" in value &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { lastPlayedAt?: unknown }).lastPlayedAt === "string"
  );
}

function isMatchEntry(value: unknown): value is MatchEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      "gameId" in value &&
      "roomCode" in value &&
      "opponentName" in value &&
      "result" in value &&
      "turns" in value &&
      "finishedAt" in value &&
      typeof (value as { gameId?: unknown }).gameId === "string" &&
      typeof (value as { roomCode?: unknown }).roomCode === "string" &&
      typeof (value as { opponentName?: unknown }).opponentName === "string" &&
      ((value as { result?: unknown }).result === "win" || (value as { result?: unknown }).result === "lose") &&
      typeof (value as { turns?: unknown }).turns === "number" &&
      typeof (value as { finishedAt?: unknown }).finishedAt === "string"
  );
}

export function getFriends(): FriendEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = parseJson<unknown>(window.localStorage.getItem(STORAGE_FRIENDS), []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isFriendEntry);
}

export function getMatchHistory(): MatchEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = parseJson<unknown>(window.localStorage.getItem(STORAGE_MATCH_HISTORY), []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isMatchEntry);
}

export function addOrUpdateFriend(name: string) {
  if (!name || typeof window === "undefined") return;

  const current = getFriends();
  const now = new Date().toISOString();
  const trimmed = name.trim();
  const without = current.filter((entry) => entry.name.toLowerCase() !== trimmed.toLowerCase());
  const updated = [{ name: trimmed, lastPlayedAt: now }, ...without].slice(0, 20);
  window.localStorage.setItem(STORAGE_FRIENDS, JSON.stringify(updated));
}

export function addMatch(entry: MatchEntry) {
  if (typeof window === "undefined") return;
  const current = getMatchHistory();
  if (current.some((item) => item.gameId === entry.gameId)) {
    return;
  }
  const updated = [entry, ...current].slice(0, 30);
  window.localStorage.setItem(STORAGE_MATCH_HISTORY, JSON.stringify(updated));
}
