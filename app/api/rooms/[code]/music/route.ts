import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { readJsonBody } from "@/lib/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureMusicAction, normalizeRoomCode, normalizeTrackIndex } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const body = await readJsonBody(request);
    const action = ensureMusicAction(body.action);
    const spectatorKey = typeof body.spectatorKey === "string" ? body.spectatorKey.trim().toUpperCase() : "";
    const admin = getSupabaseAdmin();

    const { data: roomData, error: roomError } = await admin
      .from("rooms")
      .select("id, spectator_code, music_track_index, music_is_playing")
      .eq("code", roomCode)
      .maybeSingle();

    const room = roomData as {
      id: string;
      spectator_code: string;
      music_track_index: number;
      music_is_playing: boolean;
    } | null;

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    let actor: "player" | "spectator" | null = null;
    try {
      const { user } = await requireAuth(request);
      const { data: memberData, error: memberError } = await admin
        .from("room_players")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }
      if (memberData) {
        actor = "player";
      }
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) {
        throw error;
      }
      // If auth is absent/invalid, spectator key is checked below.
    }

    if (!actor) {
      if (!spectatorKey || spectatorKey !== room.spectator_code) {
        throw new HttpError(403, "FORBIDDEN", "Управление музыкой доступно только участникам комнаты или наблюдателю.");
      }
      actor = "spectator";
    }

    let nextTrackIndex = normalizeTrackIndex(room.music_track_index);
    let isPlaying = room.music_is_playing;
    let startedAt: string | null = null;
    const updatedAt = new Date().toISOString();

    if (action === "next") {
      nextTrackIndex = normalizeTrackIndex(nextTrackIndex + 1);
      isPlaying = true;
      startedAt = updatedAt;
    } else {
      isPlaying = !isPlaying;
      startedAt = isPlaying ? updatedAt : null;
    }

    const { error: updateError } = await admin
      .from("rooms")
      .update({
        music_track_index: nextTrackIndex,
        music_is_playing: isPlaying,
        music_started_at: startedAt,
        music_updated_at: updatedAt
      })
      .eq("id", room.id);

    if (updateError) {
      throw updateError;
    }

    await addRoomEvent(room.id, "music_updated", {
      action,
      actor,
      trackIndex: nextTrackIndex,
      isPlaying
    });

    return ok({
      ok: true,
      music: {
        trackIndex: nextTrackIndex,
        isPlaying,
        startedAt,
        updatedAt
      }
    });
  } catch (error) {
    return fromError(error);
  }
}
