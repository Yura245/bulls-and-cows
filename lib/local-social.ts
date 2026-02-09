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

export function getFriends(): FriendEntry[] {
  if (typeof window === "undefined") return [];
  return parseJson<FriendEntry[]>(window.localStorage.getItem(STORAGE_FRIENDS), []);
}

export function getMatchHistory(): MatchEntry[] {
  if (typeof window === "undefined") return [];
  return parseJson<MatchEntry[]>(window.localStorage.getItem(STORAGE_MATCH_HISTORY), []);
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
