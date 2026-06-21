"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { useHaptic } from "@/hooks/useHaptic";

type PushState = "idle" | "saving" | "success" | "error" | "unsupported" | "denied";

const DUMMY_PUSH_KEYS = {
  auth: "push-delivery-coming-soon",
  p256dh: "push-delivery-coming-soon",
} as const;

export function PushOptIn() {
  const haptic = useHaptic();
  const [state, setState] = useState<PushState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubscribe() {
    haptic.medium();
    setMessage(null);

    if (!("Notification" in window)) {
      setState("unsupported");
      setMessage("Not supported in this browser");
      return;
    }

    setState("saving");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        setMessage("To enable later, update browser notification settings");
        return;
      }

      const { data } = await createBrowserClient().auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        setState("error");
        setMessage("Sign in again to enable alerts");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: `https://night-vibe-checker.local/push/coming-soon/${encodeURIComponent(userId)}`,
          keys: DUMMY_PUSH_KEYS,
        }),
      });

      if (!res.ok) {
        throw new Error("Subscription save failed");
      }

      setState("success");
      setMessage("Alerts coming soon - you're on the list!");
    } catch {
      setState("error");
      setMessage("Could not save alert preference");
    }
  }

  const subscribed = state === "success";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" aria-label="Push alerts">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight text-white">
            Get notified when venues get packed
          </h2>
          {message && (
            <p
              className={`mt-2 text-xs font-semibold ${subscribed ? "text-[#8B6CFF]" : "text-white/55"}`}
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
          className="shrink-0 rounded-full bg-[#8B6CFF] px-4 text-xs font-semibold text-[#0A0A0E] hover:bg-[#A896FF]"
        >
          {state === "saving" ? "Enabling..." : subscribed ? "Enabled" : "Enable alerts"}
        </Button>
      </div>
    </section>
  );
}
