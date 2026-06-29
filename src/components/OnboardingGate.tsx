"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const POST_AUTH_ACTION_KEY = "nytchkr.postAuthAction";
const POST_AUTH_RETURN_KEY = "nytchkr.postAuthReturnUrl";

type PendingAuthAction = {
  id: string;
  label: string;
  returnTo: string;
  createdAt: number;
};

type GateRequest = {
  id: string;
  label: string;
  returnTo?: string;
  onAuthenticated?: () => void | Promise<void>;
};

type OnboardingGateContextValue = {
  requireAuth: (request: GateRequest) => Promise<boolean>;
  consumePendingAction: (id: string) => boolean;
};

const OnboardingGateContext = createContext<OnboardingGateContextValue | null>(null);

function currentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function safeReturnUrl(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return currentPath();
  return value;
}

function storePendingAction(action: PendingAuthAction) {
  try {
    window.sessionStorage.setItem(POST_AUTH_ACTION_KEY, JSON.stringify(action));
    window.sessionStorage.setItem(POST_AUTH_RETURN_KEY, action.returnTo);
  } catch {
    // Auth still works if storage is unavailable; only action resume is skipped.
  }
}

function readPendingAction(): PendingAuthAction | null {
  try {
    const raw = window.sessionStorage.getItem(POST_AUTH_ACTION_KEY);
    if (!raw) return null;
    const action = JSON.parse(raw) as PendingAuthAction;
    if (!action?.id || Date.now() - action.createdAt > 30 * 60 * 1000) return null;
    return action;
  } catch {
    return null;
  }
}

function clearPendingAction() {
  try {
    window.sessionStorage.removeItem(POST_AUTH_ACTION_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

export function useOnboardingGate() {
  const value = useContext(OnboardingGateContext);
  if (!value) {
    throw new Error("useOnboardingGate must be used inside OnboardingGateProvider");
  }
  return value;
}

export function OnboardingGateProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAuthAction | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const resumeRef = useRef<(() => void | Promise<void>) | null>(null);

  const closeGate = useCallback(() => {
    setOpen(false);
    setError("");
  }, []);

  const resumeAfterAuth = useCallback(async () => {
    if (!session?.user?.id) return;

    const callback = resumeRef.current;
    resumeRef.current = null;
    clearPendingAction();
    closeGate();

    if (callback) {
      await callback();
    }
  }, [closeGate, session?.user?.id]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void resumeAfterAuth();
  }, [resumeAfterAuth, status]);

  const requireAuth = useCallback(async (request: GateRequest) => {
    if (session?.user?.id) {
      if (request.onAuthenticated) {
        await request.onAuthenticated();
      }
      return true;
    }

    const action = {
      id: request.id,
      label: request.label,
      returnTo: safeReturnUrl(request.returnTo),
      createdAt: Date.now(),
    };

    storePendingAction(action);
    resumeRef.current = request.onAuthenticated ?? null;
    setPendingAction(action);
    setOpen(true);
    return false;
  }, [session?.user?.id]);

  const consumePendingAction = useCallback((id: string) => {
    const action = readPendingAction();
    if (action?.id !== id) return false;
    clearPendingAction();
    return true;
  }, []);

  const value = useMemo(
    () => ({ requireAuth, consumePendingAction }),
    [consumePendingAction, requireAuth],
  );

  useFocusTrap(open, dialogRef, closeGate);

  async function handleGoogleSignIn() {
    if (googleSigningIn) return;
    setGoogleSigningIn(true);
    const returnTo = pendingAction?.returnTo ?? currentPath();
    await signIn("google", { callbackUrl: returnTo });
  }

  return (
    <OnboardingGateContext.Provider value={value}>
      {children}
      {open ? (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-gate-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close sign-in prompt"
            className="absolute inset-0 cursor-default"
            onClick={closeGate}
          />
          <section className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-[18px] border border-white/[0.08] bg-[#0A0A0E] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11.5px] font-semibold text-[#8B6CFF]">nytchkr</p>
                <h2 id="onboarding-gate-title" className="font-display mt-1 text-xl font-semibold text-[#F4F5F8]">
                  Sign in to keep going
                </h2>
                <p className="mt-1 text-sm text-white/50">{pendingAction?.label ?? "Unlock the full vibe."}</p>
              </div>
              <button
                type="button"
                aria-label="Close sign-in prompt"
                onClick={closeGate}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-white/70" aria-label="Find venues · See busyness · Save your spots">
              {["Find venues", "See busyness", "Save your spots"].map((item, index) => (
                <li key={item} className="flex items-center gap-2">
                  <span>{item}</span>
                  {index < 2 ? <span className="text-white/25" aria-hidden="true">·</span> : null}
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={googleSigningIn}
                className="flex min-h-12 w-full items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.07] px-4 text-sm font-semibold text-[#F4F5F8] transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                {googleSigningIn ? "Connecting..." : "Continue with Google"}
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-3 text-xs font-semibold text-[#F0568C]">
                {error}
              </p>
            ) : null}

            <Link
              href={`/sign-in?return=${encodeURIComponent(pendingAction?.returnTo ?? currentPath())}`}
              className="mt-4 block text-center text-xs font-bold text-white/55 underline-offset-4 hover:text-white/70 hover:underline focus:outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Open full sign-in page
            </Link>
          </section>
        </div>
      ) : null}
    </OnboardingGateContext.Provider>
  );
}
