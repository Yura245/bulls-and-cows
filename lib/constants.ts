export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_HOURS = 24;
export const HEARTBEAT_STALE_SECONDS = 45;

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
  "player_left"
] as const;
export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];
