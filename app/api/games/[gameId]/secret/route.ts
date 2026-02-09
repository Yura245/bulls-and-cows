import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { computeTurnDeadline } from "@/lib/game-clock";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureFourDigitsNoRepeats } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const gameId = params.gameId;
    const body = await readJsonBody(request);
    const secret = ensureFourDigitsNoRepeats(body.secret, "INVALID_SECRET");
    const admin = getSupabaseAdmin();

    const { data: gameData, error: gameError } = await admin
      .from("games")
      .select("id, room_id, status")
      .eq("id", gameId)
      .maybeSingle();

    const game = gameData as { id: string; room_id: string; status: string } | null;

    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "GAME_NOT_FOUND", "Игра не найдена.");
    }
    if (game.status !== "waiting_secrets") {
      throw new HttpError(409, "GAME_ALREADY_STARTED", "Секреты уже заданы.");
    }

    const { data: membershipData, error: membershipError } = await admin
      .from("room_players")
      .select("seat")
      .eq("room_id", game.room_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const membership = membershipData as { seat: number } | null;

    if (membershipError) {
      throw membershipError;
    }
    if (!membership) {
      throw new HttpError(403, "FORBIDDEN", "Вы не участник этой игры.");
    }

    const { error: upsertError } = await admin.from("game_secrets").upsert(
      {
        game_id: game.id,
        seat: membership.seat,
        secret,
        is_set: true,
        set_at: new Date().toISOString()
      },
      {
        onConflict: "game_id,seat"
      }
    );

    if (upsertError) {
      throw upsertError;
    }

    await addRoomEvent(game.room_id, "secret_set", {
      gameId: game.id,
      seat: membership.seat
    });

    const { data: allSecretsData, error: allSecretsError } = await admin
      .from("game_secrets")
      .select("seat, is_set")
      .eq("game_id", game.id);

    const allSecrets = (allSecretsData as { seat: number; is_set: boolean }[] | null) ?? [];

    if (allSecretsError) {
      throw allSecretsError;
    }

    const bothSet = allSecrets.filter((entry) => entry.is_set).length === 2;
    if (!bothSet) {
      return ok({
        ok: true,
        gameStatus: "waiting_secrets" as const
      });
    }

    const { data: roomData, error: roomError } = await admin
      .from("rooms")
      .select("turn_seconds")
      .eq("id", game.room_id)
      .maybeSingle();

    const room = roomData as { turn_seconds: number } | null;

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    const turnSeat = Math.random() >= 0.5 ? 1 : 2;
    const turnDeadlineAt = computeTurnDeadline(room.turn_seconds);

    const { error: gameUpdateError } = await admin
      .from("games")
      .update({
        status: "active",
        turn_seat: turnSeat,
        turn_deadline_at: turnDeadlineAt,
        started_at: new Date().toISOString()
      })
      .eq("id", game.id)
      .eq("status", "waiting_secrets");

    if (gameUpdateError) {
      throw gameUpdateError;
    }

    const { error: roomUpdateError } = await admin.from("rooms").update({ status: "active" }).eq("id", game.room_id);
    if (roomUpdateError) {
      throw roomUpdateError;
    }

    return ok({
      ok: true,
      gameStatus: "active" as const
    });
  } catch (error) {
    return fromError(error);
  }
}
