import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureTurnSeconds, normalizeRoomCode } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const body = await readJsonBody(request);
    const turnSeconds = ensureTurnSeconds(body.turnSeconds);
    const admin = getSupabaseAdmin();

    const { data: roomData, error: roomError } = await admin
      .from("rooms")
      .select("id, host_user_id, status")
      .eq("code", roomCode)
      .maybeSingle();

    const room = roomData as { id: string; host_user_id: string; status: string } | null;

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }
    if (room.host_user_id !== user.id) {
      throw new HttpError(403, "FORBIDDEN", "Только хост может менять настройки комнаты.");
    }
    if (room.status === "active") {
      throw new HttpError(409, "GAME_ALREADY_ACTIVE", "Нельзя менять таймер во время активного матча.");
    }

    const { error: updateError } = await admin.from("rooms").update({ turn_seconds: turnSeconds }).eq("id", room.id);
    if (updateError) {
      throw updateError;
    }

    await addRoomEvent(room.id, "settings_updated", { turnSeconds });

    return ok({
      ok: true,
      settings: {
        turnSeconds
      }
    });
  } catch (error) {
    return fromError(error);
  }
}
