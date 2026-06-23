"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VISIT_COUNT_KEY = "nv_visit_count";
const DISMISSED_KEY = "nv_pwa_dismissed";

type BeforeInstallPromptUserChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptUserChoice>;
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function readVisitCount() {
  try {
    const value = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? "0", 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function hasDismissedBanner() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function isIOSDevice() {
  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints;

  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

export function PWAInstallVisitTracker({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const nextVisitCount = readVisitCount() + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(nextVisitCount));
      window.dispatchEvent(new CustomEvent("nv-pwa-visit-count-updated"));
    } catch {
      // Storage can be unavailable in private browsing; the banner will stay hidden.
    } finally {
      setIsReady(true);
    }
  }, []);

  if (!isReady) return null;

  return <>{children}</>;
}

export default function PWAInstallBanner() {
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visitCount, setVisitCount] = useState(0);
  const [dismissed, setDismissed] = useState(true);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const refreshEligibility = useCallback(() => {
    setVisitCount(readVisitCount());
    setDismissed(hasDismissedBanner());
    setIsIOS(isIOSDevice());
    setIsStandalone(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    refreshEligibility();

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setHasPrompt(true);
      refreshEligibility();
    }

    function handleAppInstalled() {
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // Ignore storage failures after install; the current session still hides the banner.
      }
      installPromptRef.current = null;
      setHasPrompt(false);
      setDismissed(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("nv-pwa-visit-count-updated", refreshEligibility);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("nv-pwa-visit-count-updated", refreshEligibility);
    };
  }, [refreshEligibility]);

  const dismissBanner = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Hide for the current session even if localStorage is unavailable.
    }

    installPromptRef.current = null;
    setDismissed(true);
    setHasPrompt(false);
  };

  const handleInstall = async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) return;

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);

    installPromptRef.current = null;
    setHasPrompt(false);
  };

  const shouldShow = visitCount >= 2 && !dismissed && !isStandalone && (hasPrompt || isIOS);

  if (!shouldShow) return null;

  return (
    <aside
      role="status"
      aria-label="Install NightVibe"
      className="fixed bottom-16 left-3 right-3 z-[1500] mx-auto max-w-md rounded-2xl border border-[#8B6CFF] bg-[#0A0A0E] px-4 py-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm font-medium leading-snug text-white">
          {hasPrompt
            ? "Add NightVibe to your home screen for the full experience"
            : "Tap Share → Add to Home Screen"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {hasPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-xl bg-[#8B6CFF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#9A7CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              Add
            </button>
          )}
          <button
            type="button"
            onClick={dismissBanner}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]"
          >
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
