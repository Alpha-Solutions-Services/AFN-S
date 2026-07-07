import { createBrowserClient } from "@supabase/ssr";
import { isAuthConfigured } from "@/lib/supabase/env";

export function createClient() {
  if (typeof window === "undefined") return null;
  if (!isAuthConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}
