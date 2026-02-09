export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_HOURS = 24;
export const HEARTBEAT_STALE_SECONDS = 45;
export const TURN_SECONDS_OPTIONS = [0, 30, 45, 60] as const;
export const MAX_CHAT_MESSAGE_LENGTH = 300;

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
  "settings_updated"
] as const;
export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];
