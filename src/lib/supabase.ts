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

// --------------- Env validation -----------------------------

export class MissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

function getSupabaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new MissingSupabaseEnvError("NEXT_PUBLIC_SUPABASE_URL");
  return supabaseUrl;
}

function getSupabaseAnonKey(): string {
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) throw new MissingSupabaseEnvError("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return supabaseAnonKey;
}

function getSupabaseServiceRoleKey(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new MissingSupabaseEnvError("SUPABASE_SERVICE_ROLE_KEY");
  return serviceKey;
}

export function assertSupabaseServerEnv(): void {
  getSupabaseUrl();
  getSupabaseAnonKey();
  getSupabaseServiceRoleKey();
}

// Singleton pattern — Next.js hot-reload can re-run module scope; reuse the
// client if it already exists to avoid creating duplicate connections.
declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: SupabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __supabaseAdmin: SupabaseClient | undefined;
}

// --------------- Anon client (used in most API routes) ------

function createAnonClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false, // server-side: don't persist auth state to cookies
    },
  });
}

function getAnonClient(): SupabaseClient {
  globalThis.__supabaseClient ??= createAnonClient();
  return globalThis.__supabaseClient;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    const client = getAnonClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = getAnonClient();
    return Reflect.set(client, prop, value, client);
  },
});

// --------------- Service-role admin client ------------------
// Only instantiated on the server; throws if the env var is missing.

function createAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getAdminClient(): SupabaseClient {
  globalThis.__supabaseAdmin ??= createAdminClient();
  return globalThis.__supabaseAdmin;
}

/**
 * Singleton — do not re-create per request.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    const client = getAdminClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = getAdminClient();
    return Reflect.set(client, prop, value, client);
  },
});

// --------------- Browser client (client components only) ----
// Creates a new client per call with session persistence via localStorage.
// Safe to call from "use client" components — never call server-side.

export function createBrowserClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
