import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureChatMessage, normalizeRoomCode } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const body = await readJsonBody(request);
    const message = ensureChatMessage(body.message);
    const admin = getSupabaseAdmin();

    const { data: roomData, error: roomError } = await admin.from("rooms").select("id").eq("code", roomCode).maybeSingle();
    const room = roomData as { id: string } | null;

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    const { data: memberData, error: memberError } = await admin
      .from("room_players")
      .select("display_name")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const member = memberData as { display_name: string } | null;

    if (memberError) {
      throw memberError;
    }
    if (!member) {
      throw new HttpError(403, "FORBIDDEN", "Только участник комнаты может писать в чат.");
    }

    const now = new Date().toISOString();

    const { data: insertedData, error: insertError } = await admin
      .from("room_messages")
      .insert({
        room_id: room.id,
        user_id: user.id,
        display_name: member.display_name,
        message,
        created_at: now
      })
      .select("id, display_name, message, created_at")
      .single();

    const inserted = insertedData as { id: string; display_name: string; message: string; created_at: string } | null;

    if (insertError || !inserted) {
      throw insertError ?? new Error("Failed to insert message.");
    }

    await addRoomEvent(room.id, "chat_message", {
      id: inserted.id,
      author: inserted.display_name
    });

    return ok({
      id: inserted.id,
      author: inserted.display_name,
      text: inserted.message,
      createdAt: inserted.created_at
    });
  } catch (error) {
    return fromError(error);
  }
}
