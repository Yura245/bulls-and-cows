"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json"
};

export async function ensureAnonymousSession() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session) {
    return session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error("Не удалось создать анонимную сессию.");
  }
  return data.session;
}

export async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const session = await ensureAnonymousSession();
  const headers = new Headers();
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    new Headers(DEFAULT_HEADERS).forEach((value, key) => headers.set(key, value));
  }
  headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(input, {
    ...init,
    headers
  });
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "Ошибка запроса.");
  }
  return payload as T;
}
