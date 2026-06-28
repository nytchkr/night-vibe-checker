"use client";

import { Suspense, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function safeReturnUrl(value: string | null): string {
  if (!value || value === "/" || !value.startsWith("/") || value.startsWith("//")) return "/explore";
  return value;
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => safeReturnUrl(searchParams.get("callbackUrl") ?? searchParams.get("return")),
    [searchParams],
  );
  const [signingIn, setSigningIn] = useState(false);

  async function handleGoogleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    await signIn("google", { callbackUrl });
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] px-4 py-10 text-[#F4F5F8]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm items-center justify-center">
        <section className="w-full space-y-8 text-center">
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8B6CFF]">nytchkr</p>
            <h1 className="font-display text-3xl font-black tracking-normal text-[#F4F5F8]">
              Sign in to nytchkr
            </h1>
            <p className="mx-auto max-w-xs text-sm font-semibold leading-6 text-white/58">
              Save your spots and check the room before you go.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={signingIn}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-white/[0.12] bg-[#111117] text-sm font-bold text-[#F4F5F8] transition-colors hover:bg-[#171720] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            {signingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Connecting
              </>
            ) : (
              "Continue with Google"
            )}
          </button>
        </section>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen-safe bg-[#0A0A0E]" />}>
      <SignInContent />
    </Suspense>
  );
}
