import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type UserSubscriptionUpdate = {
  pro?: boolean;
  stripe_subscription_id?: string | null;
  subscription_status?: string;
  subscription_current_period_end?: string | null;
};

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

function getStripeId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return typeof value.id === "string" ? value.id : null;
}

function toIsoTimestamp(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const legacySubscription = subscription as Stripe.Subscription & { current_period_end?: number | null };
  return toIsoTimestamp(legacySubscription.current_period_end);
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (parentSubscription) return getStripeId(parentSubscription);

  const firstSubscriptionLine = invoice.lines.data.find((line) => line.subscription);
  return getStripeId(firstSubscriptionLine?.subscription);
}

function getInvoicePeriodEnd(invoice: Stripe.Invoice): string | null {
  const subscriptionLine = invoice.lines.data.find((line) => line.subscription && line.period?.end);
  return toIsoTimestamp(subscriptionLine?.period.end ?? invoice.period_end);
}

async function updateUserByCustomer(
  customerId: string,
  values: UserSubscriptionUpdate,
): Promise<{ error: Error | null }> {
  const { error } = await supabaseAdmin
    .from("users")
    .update(values)
    .eq("stripe_customer_id", customerId);

  return { error: error ? new Error(error.message) : null };
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(subscription.customer);
  if (!customerId) return;

  const { error } = await updateUserByCustomer(customerId, {
    pro: true,
    stripe_subscription_id: subscription.id,
    subscription_status: "active",
    subscription_current_period_end: getSubscriptionPeriodEnd(subscription),
  });

  if (error) throw error;
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(subscription.customer);
  if (!customerId) return;

  const { error } = await updateUserByCustomer(customerId, {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_current_period_end: getSubscriptionPeriodEnd(subscription),
  });

  if (error) throw error;
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = getStripeId(subscription.customer);
  if (!customerId) return;

  const { error } = await updateUserByCustomer(customerId, {
    pro: false,
    stripe_subscription_id: subscription.id,
    subscription_status: "canceled",
    subscription_current_period_end: getSubscriptionPeriodEnd(subscription),
  });

  if (error) throw error;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = getStripeId(invoice.customer);
  if (!customerId) return;

  const { error } = await updateUserByCustomer(customerId, {
    stripe_subscription_id: getInvoiceSubscriptionId(invoice),
    subscription_current_period_end: getInvoicePeriodEnd(invoice),
  });

  if (error) throw error;
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = getStripeId(invoice.customer);
  if (!customerId) return;

  console.log("[stripe webhook] invoice.payment_failed email placeholder", {
    customerId,
    invoiceId: invoice.id,
    customerEmail: invoice.customer_email,
  });

  const { error } = await updateUserByCustomer(customerId, {
    stripe_subscription_id: getInvoiceSubscriptionId(invoice),
    subscription_status: "past_due",
  });

  if (error) throw error;
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    default:
      return;
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, signature, getWebhookSecret());
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (error) {
    console.error("[stripe webhook] event handling failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
