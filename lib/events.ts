import type { RoomEventType } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function addRoomEvent(roomId: string, type: RoomEventType, payload: Record<string, unknown> = {}) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("room_events").insert({
    room_id: roomId,
    type,
    payload
  });

  if (error) {
    throw error;
  }
}
