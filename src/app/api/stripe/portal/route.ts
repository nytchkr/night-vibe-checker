import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type PortalResponse = {
  url: string;
};

type ErrorResponse = {
  error: string;
};

export async function POST(req: NextRequest): Promise<NextResponse<PortalResponse | ErrorResponse>> {
  try {
    assertSupabaseServerEnv();
    assertStripePortalEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError || error instanceof MissingStripeEnvError) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    throw error;
  }

  const user = await getBearerUser(req.headers.get("Authorization"));
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const customerId = await getStripeCustomerId(user);
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer exists for this account." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const origin = getRequestOrigin(req);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/profile/saved`,
    });

    return NextResponse.json({ url: portalSession.url }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[stripe portal] failed", error);
    return NextResponse.json(
      { error: "Could not open billing portal." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

async function getBearerUser(authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function readStripeCustomerId(user: User): string | null {
  const value = user.app_metadata?.stripe_customer_id;
  return typeof value === "string" && value.startsWith("cus_") ? value : null;
}

async function getStripeCustomerId(user: User): Promise<string | null> {
  const metadataCustomerId = readStripeCustomerId(user);
  if (metadataCustomerId) return metadataCustomerId;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return null;
  const value = (data as { stripe_customer_id?: unknown } | null)?.stripe_customer_id;
  return typeof value === "string" && value.startsWith("cus_") ? value : null;
}

function getRequestOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin;
}

class MissingStripeEnvError extends Error {
  constructor(variableName: string) {
    super(`Missing ${variableName}`);
    this.name = "MissingStripeEnvError";
  }
}

function assertStripePortalEnv(): void {
  if (!process.env.STRIPE_SECRET_KEY) throw new MissingStripeEnvError("STRIPE_SECRET_KEY");
}
