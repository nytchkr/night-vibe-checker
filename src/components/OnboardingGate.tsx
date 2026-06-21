"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";

const POST_AUTH_ACTION_KEY = "nightvibe.postAuthAction";
const POST_AUTH_RETURN_KEY = "nightvibe.postAuthReturnUrl";

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

function getRedirectOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
}

function getOAuthRedirectOrigin(): string {
  const origin = getRedirectOrigin();
  const { hostname } = new URL(origin);

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    throw new Error("Google OAuth requires a production redirect origin.");
  }

  return origin;
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
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [emailSigningIn, setEmailSigningIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAuthAction | null>(null);
  const resumeRef = useRef<(() => void | Promise<void>) | null>(null);

  const closeGate = useCallback(() => {
    setOpen(false);
    setError("");
    setOtpSent(false);
  }, []);

  const resumeAfterAuth = useCallback(async (session: Session | null) => {
    if (!session) return;

    const callback = resumeRef.current;
    resumeRef.current = null;
    clearPendingAction();
    closeGate();

    if (callback) {
      await callback();
    }
  }, [closeGate]);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      void resumeAfterAuth(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      void resumeAfterAuth(session);
    });

    return () => subscription.unsubscribe();
  }, [resumeAfterAuth]);

  const requireAuth = useCallback(async (request: GateRequest) => {
    const client = createBrowserClient();
    const { data } = await client.auth.getSession();

    if (data.session) return true;

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
  }, []);

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

  async function handleGoogleSignIn() {
    if (googleSigningIn) return;

    setGoogleSigningIn(true);
    setError("");

    try {
      const client = createBrowserClient();
      const origin = getOAuthRedirectOrigin();
      const returnTo = pendingAction?.returnTo ?? currentPath();
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback?return=${encodeURIComponent(returnTo)}` },
      });

      if (signInError) setError(signInError.message);
    } catch {
      setError("Google sign-in is unavailable here. Use email instead.");
    } finally {
      setGoogleSigningIn(false);
    }
  }

  async function handleEmailSignIn() {
    if (!email.trim() || emailSigningIn) return;

    setEmailSigningIn(true);
    setError("");

    try {
      const client = createBrowserClient();
      const origin = getRedirectOrigin();
      const returnTo = pendingAction?.returnTo ?? currentPath();
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${origin}/auth/callback?return=${encodeURIComponent(returnTo)}` },
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setOtpSent(true);
    } catch {
      setError("Could not send the magic link. Try again.");
    } finally {
      setEmailSigningIn(false);
    }
  }

  return (
    <OnboardingGateContext.Provider value={value}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-gate-title"
        >
          <button
            type="button"
            aria-label="Close sign-in prompt"
            className="absolute inset-0 cursor-default"
            onClick={closeGate}
          />
          <section className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#11111A] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8B6CFF]">nytchkr</p>
                <h2 id="onboarding-gate-title" className="font-display mt-1 text-xl font-black text-white">
                  Sign in to keep going
                </h2>
                <p className="mt-1 text-sm text-white/50">{pendingAction?.label ?? "Unlock the full vibe."}</p>
              </div>
              <button
                type="button"
                aria-label="Close sign-in prompt"
                onClick={closeGate}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-white/70" aria-label="Check in at venues · See the M/F vibe · Save your spots">
              {["Check in at venues", "See the M/F vibe", "Save your spots"].map((item, index) => (
                <li key={item} className="flex items-center gap-2">
                  <span>{item}</span>
                  {index < 2 ? <span className="text-white/25" aria-hidden="true">·</span> : null}
                </li>
              ))}
            </ul>

            {otpSent ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
                Magic link sent to <span className="font-bold text-white">{email}</span>.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleSigningIn}
                  className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {googleSigningIn ? "Connecting..." : "Continue with Google"}
                </button>

                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/35">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>or</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <div className="flex gap-2">
                  <label htmlFor="onboarding-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="onboarding-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleEmailSignIn()}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm font-semibold text-white placeholder:text-white/25 focus:border-[#8B6CFF]/50 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/20"
                  />
                  <button
                    type="button"
                    onClick={handleEmailSignIn}
                    disabled={!email.trim() || emailSigningIn}
                    className="min-h-12 rounded-2xl bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  >
                    {emailSigningIn ? "Sending" : "Email"}
                  </button>
                </div>
              </div>
            )}

            {error ? (
              <p role="alert" className="mt-3 text-xs font-semibold text-[#F0568C]">
                {error}
              </p>
            ) : null}

            <Link
              href={`/login?return=${encodeURIComponent(pendingAction?.returnTo ?? currentPath())}`}
              className="mt-4 block text-center text-xs font-bold text-white/42 underline-offset-4 hover:text-white/70 hover:underline"
            >
              Open full sign-in page
            </Link>
          </section>
        </div>
      ) : null}
    </OnboardingGateContext.Provider>
  );
}
