import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { applyTimeoutByRoomCode, computeTurnDeadline } from "@/lib/game-clock";
import { computeBullsAndCows, flipSeat } from "@/lib/game";
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
    const guess = ensureFourDigitsNoRepeats(body.guess, "INVALID_GUESS");
    const admin = getSupabaseAdmin();

    const { data: gameData, error: gameError } = await admin
      .from("games")
      .select("id, room_id, status, turn_seat, turn_deadline_at")
      .eq("id", gameId)
      .maybeSingle();

    let game = gameData as {
      id: string;
      room_id: string;
      status: string;
      turn_seat: 1 | 2 | null;
      turn_deadline_at: string | null;
    } | null;

    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "GAME_NOT_FOUND", "Игра не найдена.");
    }
    if (game.status !== "active") {
      throw new HttpError(409, "GAME_NOT_ACTIVE", "Игра не находится в активной фазе.");
    }

    const { data: roomData, error: roomError } = await admin
      .from("rooms")
      .select("code, turn_seconds")
      .eq("id", game.room_id)
      .maybeSingle();

    const room = roomData as { code: string; turn_seconds: number } | null;
    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    if (room.turn_seconds > 0) {
      await applyTimeoutByRoomCode(room.code);

      const { data: refreshedGameData, error: refreshedError } = await admin
        .from("games")
        .select("id, room_id, status, turn_seat, turn_deadline_at")
        .eq("id", game.id)
        .maybeSingle();

      if (refreshedError) {
        throw refreshedError;
      }
      game = refreshedGameData as typeof game;

      if (!game || game.status !== "active") {
        throw new HttpError(409, "GAME_NOT_ACTIVE", "Игра уже изменилась, обновите страницу.");
      }
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

    const mySeat = membership.seat as 1 | 2;
    if (game.turn_seat !== mySeat) {
      throw new HttpError(409, "NOT_YOUR_TURN", "Сейчас ход соперника.");
    }

    if (room.turn_seconds > 0 && game.turn_deadline_at && new Date(game.turn_deadline_at).getTime() < Date.now()) {
      throw new HttpError(409, "TURN_EXPIRED", "Ваше время вышло, ход перешел сопернику.");
    }

    const { data: opponentSecretDataRaw, error: secretError } = await admin
      .from("game_secrets")
      .select("secret")
      .eq("game_id", game.id)
      .neq("seat", mySeat)
      .eq("is_set", true)
      .maybeSingle();

    const opponentSecretData = opponentSecretDataRaw as { secret: string } | null;

    if (secretError) {
      throw secretError;
    }
    if (!opponentSecretData) {
      throw new HttpError(409, "SECRET_NOT_READY", "Соперник еще не задал секрет.");
    }

    const { bulls, cows } = computeBullsAndCows(opponentSecretData.secret, guess);

    const { data: latestTurnData, error: latestTurnError } = await admin
      .from("guesses")
      .select("turn_no")
      .eq("game_id", game.id)
      .order("turn_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestTurn = latestTurnData as { turn_no: number } | null;
    if (latestTurnError) {
      throw latestTurnError;
    }

    const turnNo = (latestTurn?.turn_no ?? 0) + 1;
    const now = new Date().toISOString();

    const { error: insertTurnError } = await admin.from("guesses").insert({
      game_id: game.id,
      turn_no: turnNo,
      guesser_seat: mySeat,
      guess,
      bulls,
      cows,
      created_at: now
    });

    if (insertTurnError) {
      if (insertTurnError.code === "23505") {
        throw new HttpError(409, "TURN_ALREADY_PROCESSED", "Этот ход уже был обработан.");
      }
      throw insertTurnError;
    }

    await addRoomEvent(game.room_id, "turn_made", {
      gameId: game.id,
      turnNo,
      seat: mySeat,
      bulls,
      cows
    });

    if (bulls === 4) {
      const { data: updatedGame, error: finishError } = await admin
        .from("games")
        .update({
          status: "finished",
          winner_seat: mySeat,
          turn_seat: null,
          turn_deadline_at: null,
          ended_at: now
        })
        .eq("id", game.id)
        .eq("status", "active")
        .eq("turn_seat", mySeat)
        .select("id")
        .maybeSingle();

      if (finishError) {
        throw finishError;
      }
      if (!updatedGame) {
        throw new HttpError(409, "GAME_STATE_CONFLICT", "Игра уже изменилась. Обновите страницу.");
      }

      const { error: roomStatusError } = await admin.from("rooms").update({ status: "finished" }).eq("id", game.room_id);
      if (roomStatusError) {
        throw roomStatusError;
      }

      await addRoomEvent(game.room_id, "game_finished", {
        gameId: game.id,
        winnerSeat: mySeat
      });

      return ok({
        bulls,
        cows,
        isWin: true,
        nextTurnSeat: null
      });
    }

    const nextTurnSeat = flipSeat(mySeat);
    const nextDeadline = computeTurnDeadline(room.turn_seconds);

    const { data: switchedGame, error: switchError } = await admin
      .from("games")
      .update({
        turn_seat: nextTurnSeat,
        turn_deadline_at: nextDeadline
      })
      .eq("id", game.id)
      .eq("status", "active")
      .eq("turn_seat", mySeat)
      .select("id")
      .maybeSingle();

    if (switchError) {
      throw switchError;
    }
    if (!switchedGame) {
      throw new HttpError(409, "GAME_STATE_CONFLICT", "Игра уже изменилась. Обновите страницу.");
    }

    return ok({
      bulls,
      cows,
      isWin: false,
      nextTurnSeat
    });
  } catch (error) {
    return fromError(error);
  }
}
