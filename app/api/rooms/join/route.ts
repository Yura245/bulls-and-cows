import { HttpError } from "@/lib/errors";
import { addRoomEvent } from "@/lib/events";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureDisplayName, normalizeRoomCode } from "@/lib/validators";
import { requireAuth } from "@/lib/auth";

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await readJsonBody(request);
    const displayName = ensureDisplayName(body.displayName);
    const roomCode = normalizeRoomCode(body.roomCode);
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

    const now = new Date().toISOString();
    const { data: existingPlayer, error: existingError } = await admin
      .from("room_players")
      .select("seat")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingPlayer) {
      const { error: touchError } = await admin
        .from("room_players")
        .update({
          display_name: displayName,
          is_online: true,
          last_seen_at: now
        })
        .eq("room_id", room.id)
        .eq("user_id", user.id);

      if (touchError) {
        throw touchError;
      }

      return ok({
        roomId: room.id,
        seat: existingPlayer.seat as 1 | 2
      });
    }

    const { data: players, error: playersError } = await admin
      .from("room_players")
      .select("seat")
      .eq("room_id", room.id)
      .order("seat", { ascending: true });

    if (playersError) {
      throw playersError;
    }

    if (players.length >= 2) {
      throw new HttpError(409, "ROOM_FULL", "Комната уже заполнена.");
    }

    const seat: 1 | 2 = players.some((entry) => entry.seat === 1) ? 2 : 1;

    const { error: insertPlayerError } = await admin.from("room_players").insert({
      room_id: room.id,
      user_id: user.id,
      display_name: displayName,
      seat,
      is_online: true,
      last_seen_at: now
    });

    if (insertPlayerError) {
      throw insertPlayerError;
    }

    await addRoomEvent(room.id, "player_joined", { seat });

    const playerCount = players.length + 1;
    if (playerCount === 2) {
      const { data: latestGame, error: latestError } = await admin
        .from("games")
        .select("id")
        .eq("room_id", room.id)
        .order("round_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        throw latestError;
      }

      if (!latestGame) {
        const { data: game, error: gameError } = await admin
          .from("games")
          .insert({
            room_id: room.id,
            round_no: 1,
            status: "waiting_secrets"
          })
          .select("id")
          .single();

        if (gameError) {
          throw gameError;
        }

        const { error: secretsError } = await admin.from("game_secrets").insert([
          {
            game_id: game.id,
            seat: 1,
            is_set: false
          },
          {
            game_id: game.id,
            seat: 2,
            is_set: false
          }
        ]);

        if (secretsError) {
          throw secretsError;
        }
      }

      const { error: roomStatusError } = await admin
        .from("rooms")
        .update({ status: "setting_secrets" })
        .eq("id", room.id);

      if (roomStatusError) {
        throw roomStatusError;
      }
    }

    return ok({
      roomId: room.id,
      seat
    });
  } catch (error) {
    return fromError(error);
  }
}
