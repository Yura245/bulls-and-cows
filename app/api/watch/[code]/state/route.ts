import { applyTimeoutByRoomCode } from "@/lib/game-clock";
import { fail, fromError, ok } from "@/lib/http";
import { buildSpectatorState } from "@/lib/state";
import { normalizeRoomCode } from "@/lib/validators";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const params = await context.params;
    const roomCode = normalizeRoomCode(params.code);
    const spectatorKey = (new URL(request.url).searchParams.get("key") ?? "").toUpperCase();

    if (!spectatorKey) {
      return fail(403, "INVALID_SPECTATOR_KEY", "Неверная ссылка наблюдателя.");
    }

    await applyTimeoutByRoomCode(roomCode);
    const state = await buildSpectatorState(roomCode, spectatorKey);
    return ok(state);
  } catch (error) {
    return fromError(error);
  }
}
