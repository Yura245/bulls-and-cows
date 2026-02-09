import { requireAuth } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRoomCode } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const admin = getSupabaseAdmin();

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id")
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    const { data: membership, error: membershipError } = await admin
      .from("room_players")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }
    if (!membership) {
      throw new HttpError(403, "FORBIDDEN", "Вы не участник этой комнаты.");
    }

    const { error: updateError } = await admin
      .from("room_players")
      .update({
        is_online: true,
        last_seen_at: new Date().toISOString()
      })
      .eq("id", membership.id);

    if (updateError) {
      throw updateError;
    }

    return ok({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
