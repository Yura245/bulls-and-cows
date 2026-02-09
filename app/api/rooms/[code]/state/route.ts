import { requireAuth } from "@/lib/auth";
import { applyTimeoutByRoomCode } from "@/lib/game-clock";
import { fromError, ok } from "@/lib/http";
import { buildRoomState } from "@/lib/state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRoomCode } from "@/lib/validators";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { user } = await requireAuth(_request);
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);

    await applyTimeoutByRoomCode(roomCode);
    const state = await buildRoomState(roomCode, user.id);

    const admin = getSupabaseAdmin();
    await admin
      .from("room_players")
      .update({
        is_online: true,
        last_seen_at: new Date().toISOString()
      })
      .eq("room_id", state.roomId)
      .eq("user_id", user.id);

    return ok(state);
  } catch (error) {
    return fromError(error);
  }
}
