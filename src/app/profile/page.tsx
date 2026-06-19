"use client";

// ============================================================
// Profile Page  — NV-062, NV-065
//
// Logged-in:  "Your Reports" header + count badge + recent check-ins
//             "Report another spot" CTA at bottom
// Logged-out: value prop text first, sign-in de-emphasized below
// Saved spots section removed. Agent board link kept.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Skeleton } from "@/components/ui/skeleton";

// --------------- Crowd badge --------------------------------

type Busyness = "dead" | "moderate" | "packed";
type CrowdFeel = "mostly_male" | "mostly_female" | "balanced" | "mixed";

const BUSYNESS_CFG: Record<Busyness, { label: string; bg: string; text: string }> = {
  dead:     { label: "Dead",     bg: "rgba(34,197,94,0.40)",  text: "#fff" },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.40)", text: "#fff" },
  packed:   { label: "Packed",   bg: "rgba(249,115,22,0.40)", text: "#fff" },
};

const CROWD_FEEL_LABEL: Record<CrowdFeel, string> = {
  mostly_male: "Mostly male",
  mostly_female: "Mostly female",
  balanced: "Balanced",
  mixed: "Mixed / unsure",
};

function BusynessBadge({ level }: { level: string }) {
  const cfg = BUSYNESS_CFG[level as Busyness];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

// --------------- Time ago -----------------------------------

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Check-in row -------------------------------

interface CheckInItem {
  id: string;
  venueId: string;
  placeId: string;
  busyness: string;
  crowdFeel: string;
  note?: string;
  createdAt: string;
}

function readLocalTestSession(): Session | null {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV === "production") return null;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;

  const keys = [
    "sb-gfsbqewkrcyclbktfyfk-auth-token",
    "sb-onlpwglwnqoivuykywrk-auth-token",
  ];

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (parsed.access_token && parsed.user?.email) return parsed as Session;
    } catch {
      // Ignore malformed local test session data.
    }
  }

  return null;
}

function CheckInRow({ item }: { item: CheckInItem }) {
  return (
    <div className="rounded-2xl border border-white/[0.09] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
      {item.busyness && (
        <div
          className="w-full flex items-center px-3 min-h-[28px]"
          style={{
            background: BUSYNESS_CFG[item.busyness as Busyness]?.bg ?? "rgba(255,255,255,0.1)",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <BusynessBadge level={item.busyness} />
        </div>
      )}
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-[15px] font-bold leading-snug truncate">{item.placeId}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[#00F5D4] text-xs font-bold">
              {CROWD_FEEL_LABEL[item.crowdFeel as CrowdFeel] ?? item.crowdFeel}
            </span>
            <span className="text-white/40 text-[11px]">{timeAgo(item.createdAt)}</span>
          </div>
          {item.note && <p className="mt-1 text-xs text-white/40 line-clamp-2">{item.note}</p>}
        </div>
      </div>
    </div>
  );
}

// --------------- Skeleton -----------------------------------

function CheckInSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.09] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
      <Skeleton className="h-7 w-full rounded-none bg-white/10" />
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/3 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// --------------- Auth sign-in (de-emphasized) ---------------

function SignInSection({
  email, setEmail, otpSent, onSignIn, signingIn,
}: {
  email: string;
  setEmail: (v: string) => void;
  otpSent: boolean;
  onSignIn: () => void;
  signingIn: boolean;
}) {
  if (otpSent) {
    return (
      <div className="rounded-2xl bg-[#1E1E2E]/60 border border-white/[0.09] p-5 text-center space-y-3">
        <p className="text-white font-semibold text-sm">Check your email</p>
        <p className="text-white/40 text-xs leading-relaxed">
          We sent a magic link to <strong className="text-white/70">{email}</strong>. Click it to sign in.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.09] p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)" }}>
      <p className="text-white/50 text-xs font-medium">Sign in to sync your reports across devices</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSignIn()}
          placeholder="your@email.com"
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/[0.06] border border-white/[0.09] placeholder:text-white/25 focus:outline-none focus:border-[#00F5D4]/50 transition-colors duration-150 min-h-[44px]"
        />
        <button
          onClick={onSignIn}
          disabled={!email.trim() || signingIn}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#0A0A0F] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 whitespace-nowrap min-h-[44px]"
          style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)" }}
        >
          {signingIn ? "Sending…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

// --------------- Main page ----------------------------------

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      const activeSession = data.session ?? readLocalTestSession();
      setSession(activeSession);
      if (activeSession) fetchCheckIns(activeSession.access_token);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        fetchCheckIns(sess.access_token);
      } else {
        setCheckIns([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCheckIns(token: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/check-ins/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const rows = (json.data?.checkIns ?? []) as Array<{
        id: string;
        venue_id?: string; venueId?: string;
        place_id?: string; placeId?: string;
        busyness?: string;
        crowd_feel?: string; crowdFeel?: string;
        note?: string;
        created_at?: string; createdAt?: string;
      }>;
      setCheckIns(rows.map((r) => ({
        id: r.id,
        venueId: r.venue_id ?? r.venueId ?? "",
        placeId: r.place_id ?? r.placeId ?? "",
        busyness: r.busyness ?? "",
        crowdFeel: r.crowd_feel ?? r.crowdFeel ?? "",
        note: r.note,
        createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
      })));
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
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
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/92 backdrop-blur-xl border-b border-white/[0.08] px-4">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-white font-black text-2xl tracking-[-0.01em]">
            Your Reports
          </h1>
          {session && checkIns.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-white/60 mt-1">
              {checkIns.length} report{checkIns.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-44">

        {/* Logged-in header */}
        {session && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.09] p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="w-10 h-10 rounded-full bg-[#00F5D4]/15 border border-[#00F5D4]/30 flex-shrink-0 flex items-center justify-center">
              <span className="text-[#00F5D4] font-bold text-base uppercase">
                {session.user.email?.[0] ?? "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{session.user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] hover:text-white transition-all duration-150 min-h-[36px]"
            >
              Sign out
            </button>
          </div>
        )}

        {/* Logged-out value prop */}
        {!session && (
          <div className="space-y-4">
            <div className="text-center py-4 space-y-2">
              <p className="text-white font-bold text-lg">See your reports, track your impact</p>
              <p className="text-white/40 text-sm max-w-xs mx-auto">Every vibe you report helps people find the right spot tonight.</p>
            </div>
            <SignInSection
              email={email}
              setEmail={setEmail}
              otpSent={otpSent}
              onSignIn={handleSignIn}
              signingIn={signingIn}
            />
          </div>
        )}

        {/* Check-in history */}
        {session && (
          <section aria-label="Your reports">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <CheckInSkeleton key={i} />)}
              </div>
            ) : checkIns.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/[0.08] p-6 text-center">
                <p className="text-white/40 text-sm">No reports yet — go report the first spot!</p>
              </div>
            ) : (
              <ul className="space-y-3 list-none">
                {checkIns.map((ci) => (
                  <li key={ci.id}><CheckInRow item={ci} /></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Report CTA */}
        {session && (
          <Link
            href="/vibe-check"
            className="flex items-center justify-center w-full min-h-[52px] rounded-2xl text-[#0A0A0F] font-black text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80 transition-all duration-150 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)", boxShadow: "0 0 24px rgba(0,245,212,0.35)" }}
          >
            Report another spot
          </Link>
        )}
      </div>
    </div>
  );
}
