"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";

type SubscriptionRow = {
  plan?: string | null;
  status?: string | null;
};

type UserSubscriptionRow = {
  pro?: boolean | null;
  subscription_status?: string | null;
};

function isPaidSubscription(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  const plan = row.plan?.toLowerCase();
  const status = row.status?.toLowerCase();
  return plan === "pro" && (status === "active" || status === "trialing");
}

function isPaidUser(row: UserSubscriptionRow | null): boolean {
  if (!row) return false;
  const status = row.subscription_status?.toLowerCase();
  return row.pro === true || status === "active" || status === "trialing";
}

export function UpgradeButton() {
  const supabaseBrowser = useMemo(() => createBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSubscription() {
      setCheckingPlan(true);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (!userId) {
          if (!cancelled) {
            setHasSession(false);
            setIsPaid(false);
          }
          return;
        }

        if (!cancelled) setHasSession(true);

        const [subscriptionResult, userResult] = await Promise.all([
          supabaseBrowser
            .from("subscriptions")
            .select("plan,status")
            .eq("user_id", userId)
            .maybeSingle(),
          supabaseBrowser
            .from("users")
            .select("pro,subscription_status")
            .eq("id", userId)
            .maybeSingle(),
        ]);

        if (!cancelled) {
          setIsPaid(
            isPaidSubscription(subscriptionResult.data as SubscriptionRow | null) ||
              isPaidUser(userResult.data as UserSubscriptionRow | null),
          );
        }
      } catch {
        if (!cancelled) setIsPaid(false);
      } finally {
        if (!cancelled) setCheckingPlan(false);
      }
    }

    void loadSubscription();

    return () => {
      cancelled = true;
    };
  }, [supabaseBrowser]);

  async function handleUpgrade() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in before upgrading.");
        return;
      }

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Could not start checkout.");
      }

      window.location.assign(json.url);
    } catch {
      setError("Could not start checkout. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingPlan || !hasSession || isPaid) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleUpgrade()}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Opening checkout..." : "Upgrade to Pro - $4.99/month"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-semibold text-[#FF8AB0]">
          {error}
        </p>
      )}
    </div>
  );
}
