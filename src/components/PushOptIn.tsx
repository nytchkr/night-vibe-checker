"use client";

import { useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { savePushSubscription } from "@/lib/push";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { useHaptic } from "@/hooks/useHaptic";

type PushState = "idle" | "saving" | "success" | "error" | "unsupported" | "denied";

type PushOptInProps = {
  accessToken?: string | null;
  venueId?: string;
  venueName?: string;
  className?: string;
};

export function PushOptIn({ accessToken, venueId, venueName, className }: PushOptInProps) {
  const haptic = useHaptic();
  const [state, setState] = useState<PushState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function getAccessToken(): Promise<string | null> {
    if (accessToken) return accessToken;
    const { data } = await createBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function saveVenueAlert(token: string) {
    if (!venueId) return;

    const res = await fetch("/api/push/venue-alert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ venueId }),
    });

    if (!res.ok) throw new Error("Venue alert save failed");
  }

  async function handleSubscribe() {
    haptic.medium();
    setMessage(null);

    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      setMessage("Not supported in this browser");
      return;
    }

    setState("saving");

    try {
      const token = await getAccessToken();
      if (!token) {
        setState("error");
        setMessage("Sign in to enable alerts");
        return;
      }

      const subscription = await savePushSubscription(token);
      if (!subscription) {
        const permission = Notification.permission;
        setState("denied");
        setMessage(permission === "denied" ? "Enable notifications in browser settings" : "Notifications are unavailable here");
        return;
      }

      await saveVenueAlert(token);

      setState("success");
      setMessage(venueName ? `We'll alert you when ${venueName} gets busy.` : "Busy venue alerts are on.");
      haptic.success();
    } catch {
      setState("error");
      setMessage("Could not enable alerts");
      haptic.error();
    }
  }

  const subscribed = state === "success";

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 ${className ?? ""}`} aria-label="Push alerts">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-base font-semibold leading-tight text-white">
            {subscribed ? <Check className="h-4 w-4 text-[#00F5D4]" aria-hidden="true" /> : <Bell className="h-4 w-4 text-[#F0568C]" aria-hidden="true" />}
            {venueName ? "Busy alert" : "Venue alerts"}
          </h2>
          <p className="mt-1 text-xs font-medium text-white/45">
            {venueName ? "Get notified when this spot heats up." : "Get notified when saved spots heat up."}
          </p>
          {message && (
            <p
              className={`mt-2 text-xs font-semibold ${subscribed ? "text-[#00F5D4]" : "text-white/55"}`}
              role={subscribed ? "status" : "alert"}
            >
              {message}
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={handleSubscribe}
          disabled={state === "saving" || subscribed}
          className="shrink-0 rounded-full bg-[#8B6CFF] px-4 text-xs font-semibold text-white hover:bg-[#9B82FF]"
        >
          {state === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Enabling
            </>
          ) : subscribed ? (
            "Enabled"
          ) : (
            "Notify me when it gets busy"
          )}
        </Button>
      </div>
    </section>
  );
}
