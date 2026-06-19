"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Skeleton } from "@/components/ui/skeleton";
import type { SavedSpot, CheckIn } from "@/types";

// --------------- Section header ----------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-white font-semibold text-base">{title}</h2>
      {count > 0 && (
        <span className="text-white/40 text-xs font-medium">{count}</span>
      )}
    </div>
  );
}

// --------------- Empty state card --------------------------

interface EmptyStateCardProps {
  icon: string;
  message: string;
  cta?: { label: string; href: string };
}

function EmptyStateCard({ icon, message, cta }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/[0.08] p-6 flex flex-col items-center gap-2.5 text-center">
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <p className="text-white/40 text-sm leading-relaxed max-w-xs">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="
            mt-0.5 px-4 py-2 rounded-xl text-xs font-semibold text-white
            bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
            transition-all duration-150
          "
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

// --------------- Saved spot row ----------------------------

function SavedSpotRow({ spot }: { spot: SavedSpot }) {
  return (
    <Link
      href={`/venues/${spot.venueId}`}
      className="
        flex items-center gap-3 px-4 py-3.5
        rounded-2xl bg-white/5 border border-white/10
        hover:bg-white/[0.07] hover:border-white/20
        transition-all duration-150
      "
    >
      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
        {spot.vibeScoreSnapshot != null ? (
          <span className="text-cyan-400 text-xs font-bold tabular-nums">
            {spot.vibeScoreSnapshot.toFixed(1)}
          </span>
        ) : (
          <span className="text-white/25 text-xs">?</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{spot.venueName}</p>
        <p className="text-white/35 text-xs truncate">{spot.address}</p>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/25 flex-shrink-0" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

// --------------- Saved spot row skeleton -------------------

function SavedSpotRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/5 border border-white/10">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0 bg-white/10" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/3 bg-white/10" />
        <Skeleton className="h-2.5 w-1/2 bg-white/10" />
      </div>
      <Skeleton className="w-3.5 h-3.5 rounded flex-shrink-0 bg-white/10" />
    </div>
  );
}

// --------------- Past check-in row -------------------------

function CheckInRow({ checkIn }: { checkIn: CheckIn }) {
  const date = new Date(checkIn.checkedInAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <Link
      href={`/venues/${checkIn.venueId}`}
      className="
        flex items-center gap-3 px-4 py-3.5
        rounded-2xl bg-white/5 border border-white/10
        hover:bg-white/[0.07] hover:border-white/20
        transition-all duration-150
      "
    >
      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex flex-col items-center justify-center leading-none gap-0.5">
        <span className="text-white/50 text-[9px] uppercase tracking-wide">{date.split(" ")[0]}</span>
        <span className="text-white text-xs font-bold">{date.split(" ")[1]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{checkIn.venueName}</p>
        {checkIn.note && <p className="text-white/35 text-xs truncate">{checkIn.note}</p>}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/25 flex-shrink-0" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

// --------------- Auth banner --------------------------------

interface AuthBannerProps {
  session: Session | null;
  email: string;
  setEmail: (v: string) => void;
  otpSent: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
}

function AuthBanner({ session, email, setEmail, otpSent, onSignIn, onSignOut, signingIn }: AuthBannerProps) {
  // Signed-in state
  if (session) {
    return (
      <div className="rounded-2xl border border-white/[0.09] p-5 flex items-center gap-4"
        style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(30,30,46,0.6) 100%)" }}>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex-shrink-0 flex items-center justify-center shadow-lg"
          style={{ boxShadow: "0 0 20px rgba(168,85,247,0.35)" }}>
          <span className="text-white font-bold text-base uppercase">
            {session.user.email?.[0] ?? "?"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Signed in</p>
          <p className="text-white/40 text-xs mt-0.5 truncate">{session.user.email}</p>
        </div>
        <button
          onClick={onSignOut}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] hover:text-white transition-all duration-150"
        >
          Sign out
        </button>
      </div>
    );
  }

  // OTP sent state
  if (otpSent) {
    return (
      <div className="rounded-2xl bg-[#1E1E2E]/60 border border-purple-500/20 p-6 text-center space-y-3">
        <div className="text-3xl">📨</div>
        <p className="text-white font-semibold text-sm">Check your email</p>
        <p className="text-white/40 text-xs leading-relaxed">
          We sent a magic link to{" "}
          <strong className="text-white/70">{email}</strong>.{" "}
          Click it to sign in.
        </p>
      </div>
    );
  }

  // Sign-in form
  return (
    <div className="rounded-2xl border border-white/[0.09] p-5 space-y-4"
      style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white/[0.07] flex-shrink-0 flex items-center justify-center mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/30" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx={12} cy={7} r={4} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Sign in to save spots</p>
          <p className="text-white/35 text-xs mt-0.5 leading-relaxed">Your saved venues and vibe history sync across devices.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSignIn()}
          placeholder="your@email.com"
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/[0.06] border border-white/[0.09] placeholder:text-white/25 focus:outline-none focus:border-purple-500/50 transition-colors duration-150"
        />
        <button
          onClick={onSignIn}
          disabled={!email.trim() || signingIn}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 whitespace-nowrap"
          style={{ boxShadow: "0 0 16px rgba(168,85,247,0.2)" }}
        >
          {signingIn ? "Sending…" : "Send link"}
        </button>
      </div>
    </div>
  );
}

// --------------- Main page ---------------------------------

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [savedSpots, setSavedSpots] = useState<SavedSpot[]>([]);
  const [pastVibeChecks] = useState<CheckIn[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchSavedSpots(data.session.access_token);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        fetchSavedSpots(sess.access_token);
      } else {
        setSavedSpots([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchSavedSpots(token: string) {
    setLoadingSpots(true);
    try {
      const res = await fetch("/api/saved-spots", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setSavedSpots(json.data?.spots ?? []);
    } finally {
      setLoadingSpots(false);
    }
  }

  async function handleSignIn() {
    if (!email.trim()) return;
    setSigningIn(true);
    try {
      const client = createBrowserClient();
      await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setOtpSent(true);
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/92 backdrop-blur-xl border-b border-white/[0.08] px-4 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
          style={{
            background:
              "radial-gradient(ellipse 70% 120% at 0% 0%, rgba(168,85,247,0.12) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-lg mx-auto py-4">
          <p className="text-[#a855f7]/70 text-[10px] font-bold uppercase tracking-[0.3em]">
            Your night log
          </p>
          <h1 className="mt-1 text-white font-black text-2xl tracking-[-0.01em]">
            My Vibes
          </h1>
          <p className="mt-1.5 text-white/40 text-[11px]">
            Your saved spots &amp; vibe history
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-44">
        <AuthBanner
          session={session}
          email={email}
          setEmail={setEmail}
          otpSent={otpSent}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          signingIn={signingIn}
        />

        <Link
          href="/agent-board"
          className="flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] px-4 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/[0.12]"
        >
          <span>Open Agent Board</span>
          <span className="text-xs text-cyan-200/70">Admin</span>
        </Link>

        {/* Saved Spots */}
        <section aria-label="Saved spots">
          <SectionHeader title="Saved Spots" count={savedSpots.length} />
          {loadingSpots ? (
            <ul className="space-y-2 list-none" aria-label="Loading saved spots" role="status">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i}><SavedSpotRowSkeleton /></li>
              ))}
              <span className="sr-only">Loading saved spots…</span>
            </ul>
          ) : savedSpots.length === 0 ? (
            <EmptyStateCard
              icon="🔖"
              message="Spots you save will appear here. Browse venues and tap the bookmark icon to save."
              cta={{ label: "Explore Venues", href: "/" }}
            />
          ) : (
            <ul className="space-y-2 list-none">
              {savedSpots.map((spot) => (
                <li key={spot.id}><SavedSpotRow spot={spot} /></li>
              ))}
            </ul>
          )}
        </section>

        {/* Past Vibe Checks */}
        <section aria-label="Past vibe checks">
          <SectionHeader title="Past Vibe Checks" count={pastVibeChecks.length} />
          {pastVibeChecks.length === 0 ? (
            <EmptyStateCard
              icon="🎛️"
              message="Vibe checks you run will be saved here so you can revisit past reports."
              cta={{ label: "Check a Vibe", href: "/vibe-check" }}
            />
          ) : (
            <ul className="space-y-2 list-none">
              {pastVibeChecks.map((ci) => (
                <li key={ci.id}><CheckInRow checkIn={ci} /></li>
              ))}
            </ul>
          )}
        </section>

        <div className="h-6" aria-hidden="true" />
      </div>
    </div>
  );
}
