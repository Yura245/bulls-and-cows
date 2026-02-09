import { ROOM_TTL_HOURS } from "@/lib/constants";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { generateRoomCode } from "@/lib/room-code";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureDisplayName } from "@/lib/validators";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await readJsonBody(request);
    const displayName = ensureDisplayName(body.displayName);
    const admin = getSupabaseAdmin();

    let room: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomCode = generateRoomCode();
      const expiresAt = new Date(Date.now() + ROOM_TTL_HOURS * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("rooms")
        .insert({
          code: roomCode,
          status: "waiting_player",
          host_user_id: user.id,
          expires_at: expiresAt
        })
        .select("id, code")
        .single();

      if (!error && data) {
        room = data;
        break;
      }
      if (error?.code !== "23505") {
        throw error;
      }
    }

    if (!room) {
      throw new HttpError(500, "ROOM_CREATE_FAILED", "Не удалось создать комнату. Попробуйте снова.");
    }

    const { error: playerError } = await admin.from("room_players").insert({
      room_id: room.id,
      user_id: user.id,
      display_name: displayName,
      seat: 1,
      is_online: true,
      last_seen_at: new Date().toISOString()
    });

    if (playerError) {
      throw playerError;
    }

    await addRoomEvent(room.id, "player_joined", {
      seat: 1
    });

    return ok({
      roomCode: room.code,
      roomId: room.id,
      seat: 1 as const
    });
  } catch (error) {
    return fromError(error);
  }
}
