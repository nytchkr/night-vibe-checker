"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useHaptic } from "@/hooks/useHaptic";

const POST_AUTH_RETURN_KEY = "nightvibe.postAuthReturnUrl";

function safeReturnUrl(value: string | null): string {
  if (!value || value === "/" || !value.startsWith("/") || value.startsWith("//")) {
    return "/map";
  }
  return value;
}

function readStoredReturnUrl() {
  try {
    return safeReturnUrl(window.sessionStorage.getItem(POST_AUTH_RETURN_KEY));
  } catch {
    return "/profile";
  }
}

function storeReturnUrl(returnUrl: string) {
  try {
    window.sessionStorage.setItem(POST_AUTH_RETURN_KEY, returnUrl);
  } catch {
    // Storage can be unavailable in private contexts. The callback URL still carries the return path.
  }
}

function clearStoredReturnUrl() {
  try {
    window.sessionStorage.removeItem(POST_AUTH_RETURN_KEY);
  } catch {
    // Ignore storage cleanup failures; auth should still proceed.
  }
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const haptic = useHaptic();
  const hasReturnParam = searchParams.has("return");
  const redirectedRef = useRef(false);
  const returnUrl = useMemo(
    () => safeReturnUrl(searchParams.get("return")),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("error") !== "auth_failed") return;

    setError(searchParams.get("message") || "Could not finish sign-in. Please try again.");
  }, [searchParams]);

  useEffect(() => {
    const client = createBrowserClient();

    function redirectAfterAuth(session: Session | null) {
      if (!session || redirectedRef.current) return;

      redirectedRef.current = true;
      const destination = hasReturnParam ? returnUrl : readStoredReturnUrl();
      clearStoredReturnUrl();
      router.push(destination);
    }

    client.auth.getSession().then(({ data }) => redirectAfterAuth(data.session));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      redirectAfterAuth(session);
    });

    return () => subscription.unsubscribe();
  }, [hasReturnParam, returnUrl, router]);

  async function handleSignIn() {
    if (!email.trim() || signingIn) return;

    haptic.medium();
    setSigningIn(true);
    setError("");

    try {
      const client = createBrowserClient();
      storeReturnUrl(returnUrl);
      const origin = getRedirectOrigin();
      const redirectTo = `${origin}/auth/callback?return=${encodeURIComponent(returnUrl)}`;
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setOtpSent(true);
    } catch {
      setError("Could not send the magic link. Try again.");
    } finally {
      setSigningIn(false);
    }
  }

  function handleGoogleSignIn() {
    if (googleSigningIn) return;
    haptic.medium();
    setGoogleSigningIn(true);
    // Redirect to server-side route that sets the PKCE code_verifier as an
    // HttpOnly cookie before handing off to Google — avoids document.cookie
    // storage issues in browsers with strict privacy settings.
    window.location.href = `/api/auth/google?return=${encodeURIComponent(returnUrl)}`;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0E] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm items-center justify-center">
        <section className="w-full space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="font-display text-3xl font-black tracking-tight text-white">
              nyt<span className="text-[#8B6CFF]">chkr</span>
            </h1>
            <p className="text-sm font-semibold text-white/50">Know before you go.</p>
            <p className="mx-auto max-w-xs text-xs font-bold text-white/45">
              Check in at venues · See the M/F vibe · Save your spots
            </p>
          </div>

          {otpSent ? (
            <div className="space-y-3 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-5 text-center">
              <p className="text-sm font-bold text-white">Check your email</p>
              <p className="text-xs leading-relaxed text-white/45">
                We sent a magic link to <strong className="text-white/70">{email}</strong>. Click it to sign in.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleSigningIn}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-gray-600 bg-gray-800 text-sm font-bold text-white transition-all duration-150 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <svg aria-hidden="true" viewBox="0 0 18 18" className="h-5 w-5">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.47-.8 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A8.997 8.997 0 0 0 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.95 10.7a5.41 5.41 0 0 1 0-3.4V4.97H.96a9.005 9.005 0 0 0 0 8.06l2.99-2.33z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.57-2.57C13.46.91 11.42 0 9 0A8.997 8.997 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
                  />
                </svg>
                {googleSigningIn ? "Connecting..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/35">
                <span className="h-px flex-1 bg-white/10" />
                <span>or</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-3">
                <label htmlFor="login-email" className="sr-only">
                  Email address
                </label>
                <input aria-label="Email address"
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSignIn()}
                  placeholder="your@email.com"
                  autoComplete="email"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "login-email-error" : undefined}
                  className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-sm font-semibold text-white transition-colors duration-150 placeholder:text-white/25 focus:border-[#8B6CFF]/50 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/20"
                />
                {error && (
                  <p id="login-email-error" role="alert" className="text-xs text-[#F0568C]">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={!email.trim() || signingIn}
                  className="h-12 w-full rounded-full bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-all duration-150 hover:bg-[#A896FF] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/80"
                >
                  {signingIn ? "Sending..." : "Send magic link"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0E]" />}>
      <LoginContent />
    </Suspense>
  );
}
