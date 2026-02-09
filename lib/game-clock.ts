import { addRoomEvent } from "@/lib/events";
import { flipSeat } from "@/lib/game";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function toIsoAfterSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function applyTimeoutByRoomCode(roomCode: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: room, error: roomError } = await admin
    .from("rooms")
    .select("id, turn_seconds")
    .eq("code", roomCode)
    .maybeSingle();

  if (roomError || !room || !room.turn_seconds) {
    return false;
  }

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, room_id, status, turn_seat, turn_deadline_at")
    .eq("room_id", room.id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameError || !game || game.status !== "active" || !game.turn_seat || !game.turn_deadline_at) {
    return false;
  }

  if (new Date(game.turn_deadline_at).getTime() > Date.now()) {
    return false;
  }

  const nextTurnSeat = flipSeat(game.turn_seat);
  const nextDeadline = toIsoAfterSeconds(room.turn_seconds);

  const { data: updatedGame, error: updateError } = await admin
    .from("games")
    .update({
      turn_seat: nextTurnSeat,
      turn_deadline_at: nextDeadline
    })
    .eq("id", game.id)
    .eq("status", "active")
    .eq("turn_seat", game.turn_seat)
    .eq("turn_deadline_at", game.turn_deadline_at)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedGame) {
    return false;
  }

  await addRoomEvent(game.room_id, "turn_timeout", {
    gameId: game.id,
    expiredSeat: game.turn_seat,
    nextTurnSeat
  });

  return true;
}

export function computeTurnDeadline(turnSeconds: number): string | null {
  return turnSeconds > 0 ? toIsoAfterSeconds(turnSeconds) : null;
}
