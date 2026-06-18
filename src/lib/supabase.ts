// ============================================================
// Night Vibe Checker — Supabase client singletons
//
// Two clients are exported:
//   supabase       → anon/public client, safe to use in Server Components
//                    and API routes for user-scoped queries
//   supabaseAdmin  → service-role client, SERVER-SIDE ONLY
//                    bypasses RLS for trusted background operations
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// --------------- Anon client (used in most API routes) ------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than silently at runtime
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars."
  );
}

// Singleton pattern — Next.js hot-reload can re-run module scope; reuse the
// client if it already exists to avoid creating duplicate connections.
declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.__supabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // server-side: don't persist auth state to cookies
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__supabaseClient = supabase;
}

// --------------- Service-role admin client ------------------
// Only instantiated on the server; throws if the env var is missing.

declare global {
  // eslint-disable-next-line no-var
  var __supabaseAdmin: SupabaseClient | undefined;
}

function createAdminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. This client is server-side only.");
  }
  return createClient(supabaseUrl!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabaseAdmin: SupabaseClient =
  globalThis.__supabaseAdmin ?? createAdminClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__supabaseAdmin = supabaseAdmin;
}
