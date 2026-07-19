import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Auth calls must use the project root URL, not /rest/v1/
const supabaseUrl = rawUrl?.replace(/\/rest\/v1\/?$/, "") ?? rawUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Helpful message during development if env is missing.
  console.error(
    "Missing Supabase env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env"
  );
}

/**
 * Abort stalled DB/auth requests after 15s so React Query can retry on a fresh
 * connection — otherwise a dropped mobile socket hangs forever with no error,
 * and a stuck token refresh blocks every query behind the auth lock.
 * Storage/functions are exempt: uploads may legitimately take longer.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const exempt = url.includes("/storage/v1/") || url.includes("/functions/v1/");
  if (exempt || typeof AbortSignal.timeout !== "function") return fetch(input, init);

  let signal: AbortSignal | undefined = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (init?.signal) {
    signal = typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, signal]) : init.signal;
  }
  return fetch(input, { ...init, signal });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchWithTimeout },
});
