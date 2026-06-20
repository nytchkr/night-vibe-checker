"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";

function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const client = createBrowserClient();

    function redirectAfterAuth(session: Session | null) {
      if (session) router.push(returnUrl);
    }

    client.auth.getSession().then(({ data }) => redirectAfterAuth(data.session));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      redirectAfterAuth(session);
    });

    return () => subscription.unsubscribe();
  }, [returnUrl, router]);

  async function handleSignIn() {
    if (!email.trim() || signingIn) return;

    setSigningIn(true);
    setError("");

    try {
      const client = createBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?return=${encodeURIComponent(returnUrl)}`;
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

  async function handleGoogleSignIn() {
    if (googleSigningIn) return;

    setGoogleSigningIn(true);
    setError("");

    try {
      const client = createBrowserClient();
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });

      if (signInError) setError(signInError.message);
    } catch {
      setError("Could not start Google sign-in. Try again.");
    } finally {
      setGoogleSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm items-center">
        <section className="w-full space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-black tracking-tight">Sign in to report</h1>
            <p className="text-sm text-white/45">We'll send a magic link to your email</p>
          </div>

          {otpSent ? (
            <div className="rounded-2xl bg-[#1E1E2E]/60 border border-white/[0.09] p-5 text-center space-y-3">
              <p className="text-white font-semibold text-sm">Check your email</p>
              <p className="text-white/40 text-xs leading-relaxed">
                We sent a magic link to <strong className="text-white/70">{email}</strong>. Click it to sign in.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleSigningIn}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#0A0A0F] font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
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

              <div className="text-center text-sm text-white/20">───── or ─────</div>

              <div
                className="rounded-2xl border border-white/[0.09] p-4 space-y-3"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <label htmlFor="login-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSignIn()}
                  placeholder="your@email.com"
                  autoComplete="email"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "login-email-error" : undefined}
                  className="w-full px-3.5 py-3 rounded-xl text-sm text-white bg-white/[0.06] border border-white/[0.09] placeholder:text-white/25 focus:outline-none focus:border-[#00F5D4]/50 focus:ring-2 focus:ring-[#00F5D4]/30 transition-colors duration-150 min-h-[48px]"
                />
                {error && (
                  <p id="login-email-error" role="alert" className="text-xs text-[#FF2D78]">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={!email.trim() || signingIn}
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-[#0A0A0F] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)" }}
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
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}>
      <LoginContent />
    </Suspense>
  );
}
