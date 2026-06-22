import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { assertSupabaseServerEnv, supabaseAdmin } from "@/lib/supabase";

export type SubscriptionPlan = "free" | "pro";
export type SubscriptionStatus = "active" | "inactive";

export type SubscriptionStatusResponse = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
};

const FREE_SUBSCRIPTION: SubscriptionStatusResponse = {
  plan: "free",
  status: "inactive",
};

type SubscriptionRow = {
  plan: string | null;
  status: string | null;
};

async function getCookieUserId(req: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function getRequestUserId(req: NextRequest): Promise<string | null> {
  return (await getCookieUserId(req)) ?? (await getBearerUserId(req));
}

export function normalizeSubscription(row: SubscriptionRow | null | undefined): SubscriptionStatusResponse {
  if (!row) return FREE_SUBSCRIPTION;

  const plan: SubscriptionPlan = row.plan === "pro" ? "pro" : "free";
  const status: SubscriptionStatus = row.status === "active" ? "active" : "inactive";
  return { plan, status };
}

export async function getUserSubscriptionStatus(userId: string): Promise<SubscriptionStatusResponse> {
  assertSupabaseServerEnv();

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[subscription] status lookup failed:", error);
    return FREE_SUBSCRIPTION;
  }

  return normalizeSubscription(data as SubscriptionRow | null);
}

export function isActiveProSubscription(subscription: SubscriptionStatusResponse): boolean {
  return subscription.plan === "pro" && subscription.status === "active";
}

export { FREE_SUBSCRIPTION };
