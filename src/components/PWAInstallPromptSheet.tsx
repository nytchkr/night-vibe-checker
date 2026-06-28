"use client";

import { useEffect, useRef, useState } from "react";

const VISIT_COUNT_KEY = "nv_visit_count";
const DISMISSED_KEY = "nv_install_dismissed";

type BeforeInstallPromptUserChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptUserChoice>;
}

function readVisitCount() {
  try {
    const value = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? "0", 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function hasDismissedInstallPrompt() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function PWAInstallPromptSheet() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visitCount, setVisitCount] = useState(0);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const nextVisitCount = readVisitCount() + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(nextVisitCount));
      setVisitCount(nextVisitCount);
      setDismissed(hasDismissedInstallPrompt());
    } catch {
      setVisitCount(0);
      setDismissed(true);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
      setVisitCount(readVisitCount());
      setDismissed(hasDismissedInstallPrompt());
    }

    function handleAppInstalled() {
      try {
        localStorage.setItem(DISMISSED_KEY, "true");
      } catch {
        // Keep the current session hidden even when storage is unavailable.
      }

      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setDismissed(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismissPrompt = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Hide for this session even if localStorage is blocked.
    }

    setDismissed(true);
  };

  const addToHomeScreen = async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);

    deferredPromptRef.current = null;
    setHasDeferredPrompt(false);
  };

  const shouldShow = visitCount >= 2 && hasDeferredPrompt && !dismissed;

  if (!shouldShow) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-install-prompt-title"
      className="fixed inset-x-0 bottom-0 z-[1600] border-t border-white/10 bg-[#14141A] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 text-white shadow-[0_-20px_52px_rgba(0,0,0,0.5)]"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="space-y-1">
          <h2 id="pwa-install-prompt-title" className="text-base font-semibold leading-tight text-white">
            Add Night Vibe to your home screen
          </h2>
          <p className="text-sm leading-5 text-white/70">Get faster access to live venue vibes</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={dismissPrompt}
            className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={addToHomeScreen}
            className="min-h-11 rounded-xl bg-[#8B6CFF] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#9A7CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14141A]"
          >
            Add to Home Screen
          </button>
        </div>
      </div>
    </section>
  );
}
