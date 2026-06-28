import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/apiAuth";
import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/db";

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
    assertStripeCheckoutEnv();
  } catch (error) {
    if (error instanceof MissingStripeEnvError) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    throw error;
  }

  const user = await getAuthenticatedUser();
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

async function getOrCreateStripeCustomer(user: { id: string; email?: string | null }): Promise<string> {
  const existingCustomerId = await readStripeCustomerId(user);
  if (existingCustomerId) {
    await syncStripeCustomerToUserRow(user, existingCustomerId);
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: {
      user_id: user.id,
    },
  });

  await syncStripeCustomerToUserRow(user, customer.id);

  return customer.id;
}

async function readStripeCustomerId(user: { id: string }): Promise<string | null> {
  const rows = (await sql`
    SELECT stripe_customer_id
    FROM users
    WHERE id = ${user.id}
    LIMIT 1
  `) as Array<{ stripe_customer_id?: unknown }>;
  const value = rows[0]?.stripe_customer_id;
  return typeof value === "string" && value.startsWith("cus_") ? value : null;
}

async function syncStripeCustomerToUserRow(user: { id: string; email?: string | null }, customerId: string): Promise<void> {
  try {
    await sql`
      INSERT INTO users (id, email, stripe_customer_id)
      VALUES (${user.id}, ${user.email ?? null}, ${customerId})
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        stripe_customer_id = EXCLUDED.stripe_customer_id
    `;
  } catch (error) {
    console.warn("[stripe checkout] users stripe customer sync skipped", error);
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
