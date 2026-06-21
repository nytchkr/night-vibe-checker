"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHaptic } from "@/hooks/useHaptic";

type PushState = "idle" | "saving" | "success" | "error" | "unsupported" | "denied";

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new ArrayBuffer(raw.length);
  const view = new Uint8Array(output);

  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }

  return output;
}

export function PushOptIn() {
  const haptic = useHaptic();
  const [state, setState] = useState<PushState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubscribe() {
    haptic.medium();
    setMessage(null);

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      setMessage("Push notifications are not supported in this browser.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setState("error");
      setMessage("Push notifications are not configured yet.");
      return;
    }

    setState("saving");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        setMessage("Notifications are off for this browser.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(publicKey),
      });

      const { data } = await createBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setState("error");
        setMessage("Sign in again to enable push notifications.");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) {
        throw new Error("Subscription save failed");
      }

      setState("success");
      setMessage("You're in 🎯");
    } catch {
      setState("error");
      setMessage("Could not enable push notifications.");
    }
  }

  const subscribed = state === "success";

  return (
    <Card className="rounded-2xl border-white/[0.09] bg-white/[0.04] text-white shadow-none">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-black leading-tight text-white">Get Friday night picks →</h2>
          <p className="mt-1 text-xs font-semibold text-white/45">
            Nightly South End picks when the weekend hits.
          </p>
          {message && (
            <p
              className={`mt-2 text-xs font-bold ${subscribed ? "text-[#8B6CFF]" : "text-white/50"}`}
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
          className="shrink-0 rounded-full bg-[#8B6CFF] px-4 text-xs font-black text-[#0A0A0E] hover:bg-[#A896FF]"
        >
          {state === "saving" ? "Saving..." : subscribed ? "On" : "Alert Me"}
        </Button>
      </CardContent>
    </Card>
  );
}
