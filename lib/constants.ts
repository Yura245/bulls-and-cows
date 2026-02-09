export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_HOURS = 24;
export const HEARTBEAT_STALE_SECONDS = 45;
export const TURN_SECONDS_OPTIONS = [0, 30, 45, 60] as const;
export const MAX_CHAT_MESSAGE_LENGTH = 300;
export const MAX_ROOM_MUSIC_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export const ROOM_STATUSES = ["waiting_player", "setting_secrets", "active", "finished"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const GAME_STATUSES = ["waiting_secrets", "active", "finished"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const ROOM_EVENT_TYPES = [
  "player_joined",
  "secret_set",
  "turn_made",
  "game_finished",
  "rematch_requested",
  "rematch_started",
  "player_left",
  "chat_message",
  "turn_timeout",
  "settings_updated",
  "music_updated"
] as const;
export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

export const SHARED_MUSIC_TRACKS = [
  "/music/casap-akim-ok-pardon-slowed.mp3",
  "/music/new-jeans-jersey-club-remix-slowed.mp3"
] as const;

export const SHARED_MUSIC_TRACK_TITLES = [
  "Casap - AKIM OK PARDON (Slowed)",
  "jersey_kub - new jeans jersey club remix 2 (Slowed)"
] as const;
