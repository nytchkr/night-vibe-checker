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

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white">
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
                className="w-full px-3.5 py-3 rounded-xl text-sm text-white bg-white/[0.06] border border-white/[0.09] placeholder:text-white/25 focus:outline-none focus:border-[#00F5D4]/50 transition-colors duration-150 min-h-[48px]"
              />
              {error && <p className="text-xs text-[#FF2D78]">{error}</p>}
              <button
                onClick={handleSignIn}
                disabled={!email.trim() || signingIn}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-[#0A0A0F] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 min-h-[48px]"
                style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)" }}
              >
                {signingIn ? "Sending..." : "Send magic link"}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0A0A0F]" />}>
      <LoginContent />
    </Suspense>
  );
}
