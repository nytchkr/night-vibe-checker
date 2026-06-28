import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type CheckoutResponse = {
  url: string;
};

type ErrorResponse = {
  error: string;
};

export async function POST(req: NextRequest): Promise<NextResponse<CheckoutResponse | ErrorResponse>> {
  try {
    assertSupabaseServerEnv();
    assertStripeCheckoutEnv();
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

  try {
    const customerId = await getOrCreateStripeCustomer(user);
    const origin = getRequestOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: process.env.STRIPE_PRICE_PRO_MONTHLY!, quantity: 1 }],
      success_url: `${origin}/profile/saved?checkout=success`,
      cancel_url: `${origin}/profile/saved?checkout=cancelled`,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json({ url: session.url }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[stripe checkout] failed", error);
    return NextResponse.json(
      { error: "Could not start checkout." },
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

async function getOrCreateStripeCustomer(user: User): Promise<string> {
  const existingCustomerId = readStripeCustomerId(user);
  if (existingCustomerId) {
    await syncStripeCustomerToUserRow(user, existingCustomerId);
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: {
      supabase_user_id: user.id,
    },
  });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      stripe_customer_id: customer.id,
    },
  });

  if (error) {
    throw error;
  }

  await syncStripeCustomerToUserRow(user, customer.id);

  return customer.id;
}

function readStripeCustomerId(user: User): string | null {
  const value = user.app_metadata?.stripe_customer_id;
  return typeof value === "string" && value.startsWith("cus_") ? value : null;
}

async function syncStripeCustomerToUserRow(user: User, customerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        stripe_customer_id: customerId,
      },
      { onConflict: "id" },
    );

  if (error) {
    console.warn("[stripe checkout] users stripe customer sync skipped", error.message);
  }
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

function assertStripeCheckoutEnv(): void {
  if (!process.env.STRIPE_SECRET_KEY) throw new MissingStripeEnvError("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_PRICE_PRO_MONTHLY) throw new MissingStripeEnvError("STRIPE_PRICE_PRO_MONTHLY");
}
