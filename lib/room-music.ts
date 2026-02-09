import { SHARED_MUSIC_TRACKS, SHARED_MUSIC_TRACK_TITLES } from "@/lib/constants";
import type { RoomStateDto } from "@/lib/dto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeTrackIndex } from "@/lib/validators";

type RoomMusicRow = {
  id: string;
  music_track_index: number;
  music_is_playing: boolean;
  music_started_at: string | null;
  music_updated_at: string;
};

type RoomMusicTrackRow = {
  id: string;
  title: string;
  storage_path: string;
};

function isMissingTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === "42P01"
  );
}

export function getBuiltinMusicTracks(): RoomStateDto["settings"]["music"]["tracks"] {
  return SHARED_MUSIC_TRACKS.map((src, index) => ({
    id: `builtin-${index + 1}`,
    title: SHARED_MUSIC_TRACK_TITLES[index] ?? `Трек ${index + 1}`,
    src,
    source: "builtin" as const
  }));
}

export async function loadUploadedMusicTracks(roomId: string): Promise<RoomStateDto["settings"]["music"]["tracks"]> {
  const admin = getSupabaseAdmin();
  const { data: tracksData, error: tracksError } = await admin
    .from("room_music_tracks")
    .select("id, title, storage_path")
    .eq("room_id", roomId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (tracksError) {
    if (isMissingTableError(tracksError)) {
      return [];
    }
    throw tracksError;
  }

  const rows = (tracksData as RoomMusicTrackRow[] | null) ?? [];
  if (!rows.length) {
    return [];
  }

  const storagePaths = rows.map((row) => row.storage_path);
  const { data: signedData, error: signedError } = await admin.storage.from("room-music").createSignedUrls(storagePaths, 60 * 60);

  if (signedError) {
    return [];
  }

  const signedRows = (signedData as { path: string; signedUrl: string | null }[] | null) ?? [];
  const signedUrlByPath = new Map<string, string>();
  signedRows.forEach((item) => {
    if (item.path && item.signedUrl) {
      signedUrlByPath.set(item.path, item.signedUrl);
    }
  });

  const uploadedTracks: RoomStateDto["settings"]["music"]["tracks"] = [];
  rows.forEach((row) => {
    const signedUrl = signedUrlByPath.get(row.storage_path);
    if (!signedUrl) {
      return;
    }
    uploadedTracks.push({
      id: row.id,
      title: row.title,
      src: signedUrl,
      source: "uploaded"
    });
  });

  return uploadedTracks;
}

export async function getRoomMusicTrackCount(roomId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const builtinCount = SHARED_MUSIC_TRACKS.length;
  const { count, error } = await admin
    .from("room_music_tracks")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("is_active", true);

  if (error) {
    if (isMissingTableError(error)) {
      return builtinCount;
    }
    throw error;
  }

  return builtinCount + (count ?? 0);
}

export async function buildRoomMusicState(room: RoomMusicRow): Promise<RoomStateDto["settings"]["music"]> {
  const builtinTracks = getBuiltinMusicTracks();
  const uploadedTracks = await loadUploadedMusicTracks(room.id);
  const tracks = [...builtinTracks, ...uploadedTracks];

  return {
    trackIndex: normalizeTrackIndex(room.music_track_index, tracks.length || builtinTracks.length || 1),
    isPlaying: room.music_is_playing,
    startedAt: room.music_started_at,
    updatedAt: room.music_updated_at,
    tracks
  };
}
