import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/apiAuth";
import { getStripeClient } from "@/lib/stripe";
import { sql } from "@/lib/db";

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
    assertStripePortalEnv();
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

  const customerId = await getStripeCustomerId(user);
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer exists for this account." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const origin = getRequestOrigin(req);
    const stripe = getStripeClient();
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

async function getStripeCustomerId(user: { id: string }): Promise<string | null> {
  const rows = (await sql`
    SELECT stripe_customer_id
    FROM users
    WHERE id = ${user.id}
    LIMIT 1
  `) as Array<{ stripe_customer_id?: unknown }>;
  const value = rows[0]?.stripe_customer_id;
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
