import { MAX_ROOM_MUSIC_FILE_SIZE_BYTES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { addRoomEvent } from "@/lib/events";
import { HttpError } from "@/lib/errors";
import { fromError, ok } from "@/lib/http";
import { buildRoomMusicState } from "@/lib/room-music";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRoomCode } from "@/lib/validators";

function ensureAudioFile(file: File): void {
  const isAudio = file.type.startsWith("audio/") || file.name.toLowerCase().endsWith(".mp3");
  if (!isAudio) {
    throw new HttpError(400, "INVALID_AUDIO_FILE", "Поддерживаются только аудиофайлы.");
  }
  if (file.size <= 0) {
    throw new HttpError(400, "INVALID_AUDIO_FILE", "Файл пустой.");
  }
  if (file.size > MAX_ROOM_MUSIC_FILE_SIZE_BYTES) {
    throw new HttpError(400, "AUDIO_FILE_TOO_LARGE", "Файл слишком большой (максимум 15 МБ).");
  }
}

function buildTrackTitle(titleRaw: FormDataEntryValue | null, fileName: string): string {
  const titleFromInput = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const fallbackTitle = fileName.replace(/\.[a-z0-9]+$/i, "").trim();
  const title = (titleFromInput || fallbackTitle || "Загруженный трек").slice(0, 120).trim();
  if (!title) {
    return "Загруженный трек";
  }
  return title;
}

function resolveFileExtension(file: File): string {
  const extFromName = file.name.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0];
  if (extFromName) {
    return extFromName;
  }

  if (file.type === "audio/ogg") return ".ogg";
  if (file.type === "audio/wav" || file.type === "audio/wave") return ".wav";
  if (file.type === "audio/aac") return ".aac";
  if (file.type === "audio/webm") return ".webm";
  if (file.type === "audio/mp4" || file.type === "audio/x-m4a") return ".m4a";
  return ".mp3";
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { user } = await requireAuth(request);
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const formData = await request.formData();
    const fileCandidate = formData.get("file");

    if (!(fileCandidate instanceof File)) {
      throw new HttpError(400, "INVALID_AUDIO_FILE", "Выберите файл для загрузки.");
    }

    ensureAudioFile(fileCandidate);
    const title = buildTrackTitle(formData.get("title"), fileCandidate.name);
    const admin = getSupabaseAdmin();

    const { data: roomData, error: roomError } = await admin
      .from("rooms")
      .select("id, music_track_index, music_is_playing, music_started_at")
      .eq("code", roomCode)
      .maybeSingle();

    const room = roomData as {
      id: string;
      music_track_index: number;
      music_is_playing: boolean;
      music_started_at: string | null;
    } | null;

    if (roomError) {
      throw roomError;
    }
    if (!room) {
      throw new HttpError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    }

    const { data: memberData, error: memberError } = await admin
      .from("room_players")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }
    if (!memberData) {
      throw new HttpError(403, "FORBIDDEN", "Только участник комнаты может добавлять треки.");
    }

    const extension = resolveFileExtension(fileCandidate);
    const storagePath = `${room.id}/${Date.now()}-${crypto.randomUUID()}${extension}`;
    const mimeType = fileCandidate.type || "audio/mpeg";
    const now = new Date().toISOString();

    const { error: uploadError } = await admin.storage.from("room-music").upload(storagePath, fileCandidate, {
      cacheControl: "3600",
      contentType: mimeType,
      upsert: false
    });

    if (uploadError) {
      throw uploadError;
    }

    const { data: insertedData, error: insertError } = await admin
      .from("room_music_tracks")
      .insert({
        room_id: room.id,
        uploader_user_id: user.id,
        title,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: fileCandidate.size,
        created_at: now
      })
      .select("id, title")
      .single();

    const inserted = insertedData as { id: string; title: string } | null;
    if (insertError || !inserted) {
      await admin.storage.from("room-music").remove([storagePath]);
      throw insertError ?? new Error("Failed to save track metadata.");
    }

    const { error: roomUpdateError } = await admin.from("rooms").update({ music_updated_at: now }).eq("id", room.id);
    if (roomUpdateError) {
      throw roomUpdateError;
    }

    await addRoomEvent(room.id, "music_updated", {
      action: "track_added",
      actor: "player",
      trackId: inserted.id,
      trackTitle: inserted.title
    });

    const music = await buildRoomMusicState({
      id: room.id,
      music_track_index: room.music_track_index,
      music_is_playing: room.music_is_playing,
      music_started_at: room.music_started_at,
      music_updated_at: now
    });

    return ok({
      ok: true,
      track: {
        id: inserted.id,
        title: inserted.title
      },
      music
    });
  } catch (error) {
    return fromError(error);
  }
}
