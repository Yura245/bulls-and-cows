import { HEARTBEAT_STALE_SECONDS } from "@/lib/constants";
import type { ChatMessageDto, RoomStateDto } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { buildRoomMusicState } from "@/lib/room-music";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RoomRow = {
  id: string;
  code: string;
  status: RoomStateDto["status"];
  expires_at: string;
  turn_seconds: number;
  music_track_index: number;
  music_is_playing: boolean;
  music_started_at: string | null;
  music_updated_at: string;
  spectator_code: string;
  host_user_id: string;
};

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

function isOnline(lastSeenAt: string, onlineFlag: boolean | null): boolean {
  if (!onlineFlag) {
    return false;
  }
  const ageSeconds = (Date.now() - new Date(lastSeenAt).getTime()) / 1000;
  return ageSeconds <= HEARTBEAT_STALE_SECONDS;
}

async function getRoomByCode(roomCode: string): Promise<RoomRow> {
  const admin = getSupabaseAdmin();
  const { data: roomData, error: roomError } = await admin
    .from("rooms")
    .select("id, code, status, expires_at, turn_seconds, music_track_index, music_is_playing, music_started_at, music_updated_at, spectator_code, host_user_id")
    .eq("code", roomCode)
    .maybeSingle();

  const room = roomData as RoomRow | null;

  if (roomError) {
    throw roomError;
  }
  if (!room) {
    throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
  }
  if (isExpired(room.expires_at)) {
    throw new HttpError(410, "ROOM_EXPIRED", "Срок жизни комнаты истек.");
  }
  return room;
}

async function loadChat(roomId: string): Promise<ChatMessageDto[]> {
  const admin = getSupabaseAdmin();
  const { data: chatRowsData, error: chatError } = await admin
    .from("room_messages")
    .select("id, display_name, message, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(50);

  const chatRows = (chatRowsData as { id: string; display_name: string; message: string; created_at: string }[] | null) ?? [];

  if (chatError) {
    throw chatError;
  }

  return chatRows
    .slice()
    .reverse()
    .map((item) => ({
      id: item.id,
      author: item.display_name,
      text: item.message,
      createdAt: item.created_at
    }));
}

async function loadStats(roomId: string): Promise<RoomStateDto["stats"]> {
  const admin = getSupabaseAdmin();

  const { data: gamesData, error: gamesError } = await admin
    .from("games")
    .select("id, winner_seat")
    .eq("room_id", roomId)
    .eq("status", "finished");

  const games = (gamesData as { id: string; winner_seat: 1 | 2 | null }[] | null) ?? [];

  if (gamesError) {
    throw gamesError;
  }

  if (!games.length) {
    return {
      seat1Wins: 0,
      seat2Wins: 0,
      finishedRounds: 0,
      avgTurns: 0
    };
  }

  const gameIds = games.map((game) => game.id);
  const { data: guessesData, error: guessesError } = await admin
    .from("guesses")
    .select("game_id, turn_no")
    .in("game_id", gameIds)
    .order("turn_no", { ascending: true });

  const guesses = (guessesData as { game_id: string; turn_no: number }[] | null) ?? [];
  if (guessesError) {
    throw guessesError;
  }

  const maxTurnByGame = new Map<string, number>();
  guesses.forEach((guess) => {
    const previous = maxTurnByGame.get(guess.game_id) ?? 0;
    if (guess.turn_no > previous) {
      maxTurnByGame.set(guess.game_id, guess.turn_no);
    }
  });

  const totalTurns = gameIds.reduce((sum, gameId) => sum + (maxTurnByGame.get(gameId) ?? 0), 0);
  const seat1Wins = games.filter((game) => game.winner_seat === 1).length;
  const seat2Wins = games.filter((game) => game.winner_seat === 2).length;

  return {
    seat1Wins,
    seat2Wins,
    finishedRounds: games.length,
    avgTurns: Number((totalTurns / games.length).toFixed(1))
  };
}

async function loadStateForViewer(
  room: RoomRow,
  viewerSeat: 1 | 2 | null,
  viewerRole: "player" | "spectator",
  isHost: boolean
): Promise<RoomStateDto> {
  const admin = getSupabaseAdmin();

  const { data: playersData, error: playersError } = await admin
    .from("room_players")
    .select("seat, display_name, is_online, last_seen_at")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });

  const players = (playersData as { seat: number; display_name: string; is_online: boolean; last_seen_at: string }[] | null) ?? [];

  if (playersError) {
    throw playersError;
  }

  const { data: latestGameData, error: gameError } = await admin
    .from("games")
    .select("id, round_no, status, turn_seat, winner_seat, turn_deadline_at")
    .eq("room_id", room.id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestGame =
    (latestGameData as {
      id: string;
      round_no: number;
      status: "waiting_secrets" | "active" | "finished";
      turn_seat: 1 | 2 | null;
      winner_seat: 1 | 2 | null;
      turn_deadline_at: string | null;
    } | null) ?? null;

  if (gameError) {
    throw gameError;
  }

  const music = await buildRoomMusicState(room);
  const chat = await loadChat(room.id);
  const stats = await loadStats(room.id);

  if (!latestGame) {
    return {
      roomId: room.id,
      roomCode: room.code,
      status: room.status,
      viewerRole,
      settings: {
        turnSeconds: room.turn_seconds,
        isHost,
        music
      },
      spectatorPath: viewerRole === "player" ? `/watch/${room.code}?key=${room.spectator_code}` : null,
      players: players.map((player) => ({
        seat: player.seat as 1 | 2,
        name: player.display_name,
        online: isOnline(player.last_seen_at, player.is_online)
      })),
      chat,
      stats,
      game: null
    };
  }

  const { data: historyData, error: historyError } = await admin
    .from("guesses")
    .select("turn_no, guesser_seat, guess, bulls, cows, created_at")
    .eq("game_id", latestGame.id)
    .order("turn_no", { ascending: true });

  const history =
    (historyData as
      | { turn_no: number; guesser_seat: number; guess: string; bulls: number; cows: number; created_at: string }[]
      | null) ?? [];

  if (historyError) {
    throw historyError;
  }

  const { data: votesData, error: votesError } = await admin
    .from("rematch_votes")
    .select("seat, voted")
    .eq("game_id", latestGame.id);

  const rematchVotes = (votesData as { seat: number; voted: boolean }[] | null) ?? [];

  if (votesError) {
    throw votesError;
  }

  let mySecretSet = false;
  let mySecret: string | null = null;
  let opponentSecretSet = false;

  if (viewerSeat) {
    const { data: secretsData, error: secretsError } = await admin
      .from("game_secrets")
      .select("seat, is_set, secret")
      .eq("game_id", latestGame.id);

    const secrets = (secretsData as { seat: number; is_set: boolean; secret: string | null }[] | null) ?? [];
    if (secretsError) {
      throw secretsError;
    }

    const ownSecret = secrets.find((entry) => entry.seat === viewerSeat);
    mySecretSet = Boolean(ownSecret?.is_set);
    mySecret = ownSecret?.secret ?? null;
    opponentSecretSet = Boolean(secrets.find((entry) => entry.seat !== viewerSeat)?.is_set);
  }

  return {
    roomId: room.id,
    roomCode: room.code,
    status: room.status,
    viewerRole,
    settings: {
      turnSeconds: room.turn_seconds,
      isHost,
      music
    },
    spectatorPath: viewerRole === "player" ? `/watch/${room.code}?key=${room.spectator_code}` : null,
    players: players.map((player) => ({
      seat: player.seat as 1 | 2,
      name: player.display_name,
      online: isOnline(player.last_seen_at, player.is_online)
    })),
    chat,
    stats,
    game: {
      id: latestGame.id,
      roundNo: latestGame.round_no,
      status: latestGame.status,
      turnSeat: latestGame.turn_seat,
      turnDeadlineAt: latestGame.turn_deadline_at,
      winnerSeat: latestGame.winner_seat,
      mySeat: viewerSeat,
      mySecretSet,
      mySecret,
      opponentSecretSet,
      history: history.map((turn) => ({
        turnNo: turn.turn_no,
        guesserSeat: turn.guesser_seat as 1 | 2,
        guess: turn.guess,
        bulls: turn.bulls,
        cows: turn.cows,
        createdAt: turn.created_at
      })),
      rematchVotes: {
        seat1: Boolean(rematchVotes.find((entry) => entry.seat === 1)?.voted),
        seat2: Boolean(rematchVotes.find((entry) => entry.seat === 2)?.voted)
      }
    }
  };
}

export async function buildRoomState(roomCode: string, userId: string): Promise<RoomStateDto> {
  const admin = getSupabaseAdmin();
  const room = await getRoomByCode(roomCode);

  const { data: meData, error: meError } = await admin
    .from("room_players")
    .select("seat")
    .eq("room_id", room.id)
    .eq("user_id", userId)
    .maybeSingle();

  const me = meData as { seat: 1 | 2 } | null;

  if (meError) {
    throw meError;
  }
  if (!me) {
    throw new HttpError(403, "FORBIDDEN", "Вы не являетесь участником комнаты.");
  }

  return loadStateForViewer(room, me.seat, "player", room.host_user_id === userId);
}

export async function buildSpectatorState(roomCode: string, spectatorKey: string): Promise<RoomStateDto> {
  const room = await getRoomByCode(roomCode);
  if (room.spectator_code !== spectatorKey.toUpperCase()) {
    throw new HttpError(403, "INVALID_SPECTATOR_KEY", "Неверная ссылка наблюдателя.");
  }
  return loadStateForViewer(room, null, "spectator", false);
}
