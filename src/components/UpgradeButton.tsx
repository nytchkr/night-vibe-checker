"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

export function UpgradeButton() {
  const { data: session, status } = useSession();
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
        if (!session?.user?.id) {
          if (!cancelled) {
            setHasSession(false);
            setIsPaid(false);
          }
          return;
        }

        if (!cancelled) setHasSession(true);

        const response = await fetch("/api/user/pro", {
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as { isPro?: boolean } | null;

        if (!cancelled) {
          setIsPaid(response.ok && data?.isPro === true);
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
  }, [session?.user?.id, status]);

  async function handleUpgrade() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      if (!session?.user?.id) {
        setError("Sign in before upgrading.");
        return;
      }

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
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
