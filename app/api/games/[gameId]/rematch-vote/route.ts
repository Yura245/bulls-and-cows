import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const gameId = params.gameId;
    const body = await readJsonBody(request);
    if (body.vote !== true) {
      throw new HttpError(400, "INVALID_VOTE", "Для реванша нужно отправить vote=true.");
    }

    const admin = getSupabaseAdmin();

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, room_id, status, round_no")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "GAME_NOT_FOUND", "Игра не найдена.");
    }
    if (game.status !== "finished") {
      throw new HttpError(409, "GAME_NOT_FINISHED", "Реванш доступен только после завершения матча.");
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

    const seat = membership.seat as 1 | 2;
    const now = new Date().toISOString();

    const { error: upsertError } = await admin.from("rematch_votes").upsert(
      {
        game_id: game.id,
        seat,
        voted: true,
        voted_at: now
      },
      {
        onConflict: "game_id,seat"
      }
    );

    if (upsertError) {
      throw upsertError;
    }

    const { data: votes, error: votesError } = await admin
      .from("rematch_votes")
      .select("seat, voted")
      .eq("game_id", game.id);

    if (votesError) {
      throw votesError;
    }

    const seat1 = Boolean(votes.find((entry) => entry.seat === 1)?.voted);
    const seat2 = Boolean(votes.find((entry) => entry.seat === 2)?.voted);

    if (!(seat1 && seat2)) {
      await addRoomEvent(game.room_id, "rematch_requested", {
        gameId: game.id,
        seat
      });

      return ok({
        votes: {
          seat1,
          seat2
        },
        rematchStarted: false
      });
    }

    const { data: latestGame, error: latestError } = await admin
      .from("games")
      .select("id, round_no")
      .eq("room_id", game.room_id)
      .order("round_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      throw latestError;
    }

    if (latestGame && latestGame.round_no > game.round_no) {
      return ok({
        votes: {
          seat1,
          seat2
        },
        rematchStarted: true
      });
    }

    let nextGameId: string | null = null;

    const { data: createdGame, error: createGameError } = await admin
      .from("games")
      .insert({
        room_id: game.room_id,
        round_no: game.round_no + 1,
        status: "waiting_secrets"
      })
      .select("id")
      .single();

    if (createGameError) {
      if (createGameError.code === "23505") {
        return ok({
          votes: {
            seat1,
            seat2
          },
          rematchStarted: true
        });
      }
      throw createGameError;
    }
    nextGameId = createdGame.id;

    const { error: secretRowsError } = await admin.from("game_secrets").insert([
      {
        game_id: nextGameId,
        seat: 1,
        is_set: false
      },
      {
        game_id: nextGameId,
        seat: 2,
        is_set: false
      }
    ]);

    if (secretRowsError) {
      throw secretRowsError;
    }

    const { error: roomUpdateError } = await admin
      .from("rooms")
      .update({ status: "setting_secrets" })
      .eq("id", game.room_id);

    if (roomUpdateError) {
      throw roomUpdateError;
    }

    await addRoomEvent(game.room_id, "rematch_started", {
      fromGameId: game.id,
      toGameId: nextGameId
    });

    return ok({
      votes: {
        seat1,
        seat2
      },
      rematchStarted: true
    });
  } catch (error) {
    return fromError(error);
  }
}
