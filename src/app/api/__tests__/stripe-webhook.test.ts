import { NextRequest } from "next/server";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

function signedRequest(payload: Record<string, unknown>, secret = "whsec_test_secret") {
  const body = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });

  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  }) as NextRequest;
}

async function postWebhook(payload: Record<string, unknown>, secret = "whsec_test_secret") {
  const { POST } = await import("../stripe/webhook/route");
  return POST(signedRequest(payload, secret));
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    mockSql.mockResolvedValue([]);
  });

  it("rejects requests with an invalid Stripe signature", async () => {
    const { POST } = await import("../stripe/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "invalid" },
        body: JSON.stringify({ id: "evt_invalid", object: "event" }),
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("marks a user pro on customer.subscription.created", async () => {
    const res = await postWebhook({
      id: "evt_subscription_created",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_123",
          object: "subscription",
          customer: "cus_123",
          status: "incomplete",
          current_period_end: 1_798_761_600,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("updates current_period_end on invoice.paid", async () => {
    const res = await postWebhook({
      id: "evt_invoice_paid",
      object: "event",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          object: "invoice",
          customer: "cus_123",
          period_end: 1_798_761_600,
          parent: {
            subscription_details: {
              subscription: "sub_123",
            },
          },
          lines: {
            data: [
              {
                subscription: "sub_123",
                period: { start: 1_796_083_200, end: 1_798_761_600 },
              },
            ],
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("marks a user past_due on invoice.payment_failed", async () => {
    const res = await postWebhook({
      id: "evt_invoice_failed",
      object: "event",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_failed",
          object: "invoice",
          customer: "cus_123",
          customer_email: "owner@example.com",
          period_end: 1_798_761_600,
          parent: {
            subscription_details: {
              subscription: "sub_123",
            },
          },
          lines: { data: [] },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });
});
