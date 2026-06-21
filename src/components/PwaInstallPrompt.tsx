"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_STORAGE_KEY = "nightvibe.pwaPromptDismissed";
const MOBILE_MAX_WIDTH = 768;

type BeforeInstallPromptUserChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptUserChoice>;
}

function hasDismissedPrompt() {
  try {
    return localStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function isMobileViewport() {
  return window.innerWidth < MOBILE_MAX_WIDTH;
}

export default function PwaInstallPrompt() {
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const refreshMobileState = useCallback(() => {
    setIsMobile(isMobileViewport());
  }, []);

  useEffect(() => {
    setDismissed(hasDismissedPrompt());
    refreshMobileState();

    window.addEventListener("resize", refreshMobileState);
    return () => {
      window.removeEventListener("resize", refreshMobileState);
    };
  }, [refreshMobileState]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function handleAppInstalled() {
      installPromptRef.current = null;
      setCanInstall(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) return;

    await promptEvent.prompt();
    installPromptRef.current = null;
    setCanInstall(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable in private contexts. Dismiss for this session either way.
    }

    installPromptRef.current = null;
    setDismissed(true);
    setCanInstall(false);
  };

  if (!isMobile || dismissed || !canInstall) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-label="Install NightVibe"
      className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[1500] mx-auto w-full max-w-lg rounded-t-[18px] border-t border-white/[0.08] bg-[#101017] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_32px_rgba(0,0,0,0.42)]"
    >
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-white">
          Add NightVibe to your home screen
        </p>
        <Button
          type="button"
          size="sm"
          onClick={handleInstall}
          className="h-9 rounded-[14px] bg-[#8B6CFF] px-4 text-[13px] font-semibold text-[#0A0A0E] hover:bg-[#9A7CFF]"
        >
          Install
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9CA2AE] transition-colors hover:bg-white/10 hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
