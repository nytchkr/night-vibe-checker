"use client";

import { useEffect, useState } from "react";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription";

type UseSubscriptionResult = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isPro: boolean;
  loading: boolean;
  error: string | null;
};

const DEFAULT_SUBSCRIPTION: Pick<UseSubscriptionResult, "plan" | "status" | "isPro"> = {
  plan: "free",
  status: "inactive",
  isPro: false,
};

export function useSubscription(): UseSubscriptionResult {
  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/subscription/status", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Subscription status failed: ${res.status}`);

        const json = await res.json();
        const plan: SubscriptionPlan = json?.plan === "pro" ? "pro" : "free";
        const status: SubscriptionStatus = json?.status === "active" ? "active" : "inactive";
        if (!cancelled) setSubscription({ plan, status, isPro: plan === "pro" && status === "active" });
      } catch (err) {
        if (!cancelled) {
          setSubscription(DEFAULT_SUBSCRIPTION);
          setError(err instanceof Error ? err.message : "Could not load subscription.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...subscription, loading, error };
}
