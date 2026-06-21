// Browser-only Supabase client — safe to import from "use client" components.
// Uses @supabase/ssr createBrowserClient so auth cookies (including the PKCE
// code_verifier) are stored in cookies, not localStorage. This lets the
// server-side /auth/callback route read the code_verifier and exchange the
// OAuth code — without this, PKCE exchange silently fails every time.

import { createBrowserClient as ssrCreateBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  browserClient ??= ssrCreateBrowserClient(supabaseUrl, supabaseAnonKey);

  return browserClient;
}
