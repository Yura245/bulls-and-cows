import { HEARTBEAT_STALE_SECONDS } from "@/lib/constants";
import type { RoomStateDto } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function buildRoomState(roomCode: string, userId: string): Promise<RoomStateDto> {
  const admin = getSupabaseAdmin();

  const { data: room, error: roomError } = await admin
    .from("rooms")
    .select("id, code, status, expires_at")
    .eq("code", roomCode)
    .maybeSingle();

  if (roomError) {
    throw roomError;
  }
  if (!room) {
    throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
  }
  if (isExpired(room.expires_at)) {
    throw new HttpError(410, "ROOM_EXPIRED", "Срок жизни комнаты истек.");
  }

  const { data: me, error: meError } = await admin
    .from("room_players")
    .select("seat")
    .eq("room_id", room.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (meError) {
    throw meError;
  }
  if (!me) {
    throw new HttpError(403, "FORBIDDEN", "Вы не являетесь участником комнаты.");
  }

  const { data: players, error: playersError } = await admin
    .from("room_players")
    .select("seat, display_name, is_online, last_seen_at")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });

  if (playersError) {
    throw playersError;
  }

  const { data: latestGame, error: gameError } = await admin
    .from("games")
    .select("id, round_no, status, turn_seat, winner_seat")
    .eq("room_id", room.id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameError) {
    throw gameError;
  }

  if (!latestGame) {
    return {
      roomId: room.id,
      roomCode: room.code,
      status: room.status,
      players: players.map((player) => ({
        seat: player.seat as 1 | 2,
        name: player.display_name,
        online: isOnline(player.last_seen_at, player.is_online)
      })),
      game: null
    };
  }

  const { data: secrets, error: secretsError } = await admin
    .from("game_secrets")
    .select("seat, is_set")
    .eq("game_id", latestGame.id);

  if (secretsError) {
    throw secretsError;
  }

  const mySecretSet = Boolean(secrets.find((entry) => entry.seat === me.seat)?.is_set);
  const opponentSecretSet = Boolean(secrets.find((entry) => entry.seat !== me.seat)?.is_set);

  const { data: history, error: historyError } = await admin
    .from("guesses")
    .select("turn_no, guesser_seat, guess, bulls, cows, created_at")
    .eq("game_id", latestGame.id)
    .order("turn_no", { ascending: true });

  if (historyError) {
    throw historyError;
  }

  const { data: rematchVotes, error: votesError } = await admin
    .from("rematch_votes")
    .select("seat, voted")
    .eq("game_id", latestGame.id);

  if (votesError) {
    throw votesError;
  }

  const seat1 = Boolean(rematchVotes.find((entry) => entry.seat === 1)?.voted);
  const seat2 = Boolean(rematchVotes.find((entry) => entry.seat === 2)?.voted);

  return {
    roomId: room.id,
    roomCode: room.code,
    status: room.status,
    players: players.map((player) => ({
      seat: player.seat as 1 | 2,
      name: player.display_name,
      online: isOnline(player.last_seen_at, player.is_online)
    })),
    game: {
      id: latestGame.id,
      roundNo: latestGame.round_no,
      status: latestGame.status,
      turnSeat: latestGame.turn_seat as 1 | 2 | null,
      winnerSeat: latestGame.winner_seat as 1 | 2 | null,
      mySeat: me.seat as 1 | 2,
      mySecretSet,
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
        seat1,
        seat2
      }
    }
  };
}
