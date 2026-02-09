import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
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

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, room_id, status")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "GAME_NOT_FOUND", "Игра не найдена.");
    }
    if (game.status !== "waiting_secrets") {
      throw new HttpError(409, "GAME_ALREADY_STARTED", "Секреты уже заданы.");
    }

    const { data: membership, error: membershipError } = await admin
      .from("room_players")
      .select("seat")
      .eq("room_id", game.room_id)
      .eq("user_id", user.id)
      .maybeSingle();

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

    const { data: allSecrets, error: allSecretsError } = await admin
      .from("game_secrets")
      .select("seat, is_set")
      .eq("game_id", game.id);

    if (allSecretsError) {
      throw allSecretsError;
    }

    const bothSet = allSecrets.filter((entry) => entry.is_set).length === 2;
    if (bothSet) {
      const turnSeat = Math.random() >= 0.5 ? 1 : 2;

      const { error: gameUpdateError } = await admin
        .from("games")
        .update({
          status: "active",
          turn_seat: turnSeat,
          started_at: new Date().toISOString()
        })
        .eq("id", game.id)
        .eq("status", "waiting_secrets");

      if (gameUpdateError) {
        throw gameUpdateError;
      }

      const { error: roomUpdateError } = await admin
        .from("rooms")
        .update({ status: "active" })
        .eq("id", game.room_id);

      if (roomUpdateError) {
        throw roomUpdateError;
      }

      return ok({
        ok: true,
        gameStatus: "active" as const
      });
    }

    return ok({
      ok: true,
      gameStatus: "waiting_secrets" as const
    });
  } catch (error) {
    return fromError(error);
  }
}
