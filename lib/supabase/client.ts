"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  browserClient = createClient<Database>(url, anonKey);
  return browserClient;
}
