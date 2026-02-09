import type { User } from "@supabase/supabase-js";

import { HttpError } from "@/lib/errors";
import { createSupabaseTokenClient } from "@/lib/supabase/token-client";

export async function requireAuth(request: Request): Promise<{ accessToken: string; user: User }> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  const accessToken = scheme?.toLowerCase() === "bearer" ? token : null;

  if (!accessToken) {
    throw new HttpError(401, "UNAUTHORIZED", "Требуется авторизация.");
  }

  const supabase = createSupabaseTokenClient(accessToken);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, "UNAUTHORIZED", "Сессия истекла. Перезайдите в игру.");
  }

  return { accessToken, user };
}
