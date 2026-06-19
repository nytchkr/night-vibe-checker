"use client";

// ============================================================
// Check-in Page  (/vibe-check)  — NV-060, NV-065
//
// Single screen flow:
//   - If venueId + venueName in URL: skip venue picker, show read-only name
//   - If no URL params: show text input for venue name
//   - 4 crowd buttons full-width (QUIET / MODERATE / PACKED / WILD)
//   - 10 numbered tap buttons for vibe score (not a slider)
//   - Submit: disabled until crowd selected
//   - Confirmation inline ("Vibe sent ✓"), auto-nav to home after 2s
// ============================================================

import { useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";

// --------------- Types --------------------------------------

type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

// --------------- Crowd config -------------------------------

const CROWD_OPTIONS: { value: CrowdLevel; label: string; color: string; bg: string; border: string }[] = [
  { value: "quiet",    label: "QUIET",    color: "#fff", bg: "rgba(34,197,94,0.40)",  border: "rgba(34,197,94,0.7)"   },
  { value: "moderate", label: "MODERATE", color: "#fff", bg: "rgba(251,191,36,0.40)", border: "rgba(251,191,36,0.7)"  },
  { value: "packed",   label: "PACKED",   color: "#fff", bg: "rgba(249,115,22,0.40)", border: "rgba(249,115,22,0.7)"  },
  { value: "wild",     label: "WILD",     color: "#fff", bg: "rgba(255,45,120,0.40)", border: "rgba(255,45,120,0.7)"  },
];

// --------------- Session ID ---------------------------------

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "night-vibe-session-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

// --------------- Back icon ----------------------------------

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// --------------- Inner page ---------------------------------

function CheckInInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const prefillVenueId = searchParams.get("venueId") ?? "";
  const prefillVenueName = decodeURIComponent(searchParams.get("venueName") ?? "");
  const hasPrefill = !!prefillVenueName.trim();

  const [venueName, setVenueName] = useState(prefillVenueName);
  const [crowdLevel, setCrowdLevel] = useState<CrowdLevel | null>(null);
  const [vibeScore, setVibeScore] = useState<number>(7);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<{ type: "duplicate" | "generic"; msg: string } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!crowdLevel || !venueName.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: prefillVenueId || venueName.trim(),
          venueName: venueName.trim(),
          crowdLevel,
          vibeScore,
          sessionId: getSessionId(),
        }),
      });
      if (!res.ok) {
        // Check for duplicate check-in rate limit before generic error
        if (res.status === 429) {
          const json = await res.json().catch(() => ({}));
          if (json?.error?.code === "DUPLICATE_CHECK_IN") {
            setSubmitError({ type: "duplicate", msg: "You already reported this spot recently. Try again in a few minutes." });
            return;
          }
        }
        setSubmitError({ type: "generic", msg: "Couldn't submit — tap to retry" });
        return;
      }
      setDone(true);
      navTimerRef.current = setTimeout(() => router.push("/"), 2000);
    } catch {
      setSubmitError({ type: "generic", msg: "Couldn't submit — tap to retry" });
    } finally {
      setSubmitting(false);
    }
  }, [crowdLevel, venueName, vibeScore, prefillVenueId, router, submitting]);

  // Cleanup timer on unmount
  // (intentionally not adding router to deps — router ref is stable)

  const canSubmit = !!crowdLevel && !!venueName.trim() && !submitting && !done;

  // --------------- Confirmation ----------------------------

  if (done) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-2xl border border-[#00F5D4]/25 p-8 flex flex-col items-center gap-5 text-center"
          style={{
            background: "linear-gradient(145deg, rgba(0,245,212,0.06), rgba(255,255,255,0.03) 60%)",
            boxShadow: "0 0 40px rgba(0,245,212,0.1)",
          }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ background: "rgba(0,245,212,0.15)", boxShadow: "0 0 24px rgba(0,245,212,0.35)" }}
            aria-hidden="true"
          >
            ✓
          </div>
          <div>
            <h2 className="text-[#00F5D4] font-black text-2xl">Vibe sent ✓</h2>
            <p className="text-white/50 text-sm mt-1">Heading back to the feed…</p>
          </div>
          <div className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 space-y-1 text-center">
            <p className="text-white font-semibold text-sm truncate">{venueName}</p>
            <p className="text-[#00F5D4] font-bold text-sm">{vibeScore}</p>
          </div>
        </div>
      </div>
    );
  }

  // --------------- Form ------------------------------------

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to feed"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 flex-shrink-0"
          >
            <BackIcon />
          </Link>
          <h1 className="text-white font-bold text-base flex-1 leading-tight truncate">
            {hasPrefill ? venueName : "Report a spot"}
          </h1>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-32">

        {/* Venue name */}
        {hasPrefill ? (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[#00F5D4]/60 text-xs" aria-hidden="true">📍</span>
            <p className="text-white font-semibold text-sm truncate" aria-label="Venue">{venueName}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="venueName" className="block text-sm font-medium text-white/70">
              Venue name <span className="text-rose-400" aria-hidden="true">*</span>
            </label>
            <input
              id="venueName"
              type="text"
              required
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="e.g. The Midnight Lounge"
              className="w-full px-4 py-3 rounded-xl text-white text-sm bg-white/[0.07] border border-white/10 placeholder:text-white/30 focus:outline-none focus:border-[#00F5D4]/60 focus:ring-1 focus:ring-[#00F5D4]/30 transition-colors duration-150 min-h-[44px]"
              autoComplete="off"
            />
          </div>
        )}

        {/* Crowd level */}
        <section aria-labelledby="crowd-label">
          <p id="crowd-label" className="text-white/70 text-sm font-semibold mb-3">
            How packed is it? <span className="text-rose-400" aria-hidden="true">*</span>
          </p>
          <div className="space-y-2" role="group" aria-labelledby="crowd-label">
            {CROWD_OPTIONS.map((opt) => {
              const selected = crowdLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCrowdLevel(opt.value)}
                  aria-pressed={selected}
                  className="w-full min-h-[56px] rounded-xl text-sm font-bold border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50 active:scale-[0.99]"
                  style={
                    selected
                      ? { background: opt.bg, color: opt.color, borderColor: opt.border, boxShadow: `0 0 16px ${opt.border}` }
                      : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Vibe score */}
        <section aria-labelledby="vibe-label">
          <div className="flex items-center justify-between mb-3">
            <p id="vibe-label" className="text-white/70 text-sm font-semibold">Vibe score</p>
            <span className="text-[#00F5D4] font-black text-xl tabular-nums" aria-live="polite" aria-label={`${vibeScore} out of 10`}>
              {vibeScore}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2" role="group" aria-labelledby="vibe-label">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => {
              const selected = vibeScore === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVibeScore(n)}
                  aria-pressed={selected}
                  aria-label={`Vibe score ${n}`}
                  className="min-h-[44px] rounded-xl text-sm font-bold border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50 active:scale-95"
                  style={
                    selected
                      ? { background: "rgba(0,245,212,0.25)", color: "#00F5D4", borderColor: "#00F5D4", boxShadow: "0 0 12px rgba(0,245,212,0.4)" }
                      : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }
                  }
                >
                  {n}
                </button>
              );
            })}
          </div>
        </section>

        {/* Submit */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full min-h-[52px] rounded-xl font-black text-[#0A0A0F] text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)",
            boxShadow: canSubmit ? "0 0 28px rgba(0,245,212,0.5), 0 0 56px rgba(0,245,212,0.15)" : undefined,
          }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-[#0A0A0F]/40 border-t-[#0A0A0F] animate-spin" />
              Sending…
            </span>
          ) : (
            "Submit"
          )}
        </button>

        {/* Inline submit error — amber for duplicate cooldown, red for generic failures */}
        {submitError && (
          <p
            role="alert"
            className={`text-sm text-center mt-2 ${submitError.type === "duplicate" ? "text-amber-400" : "text-rose-400"}`}
          >
            {submitError.msg}
          </p>
        )}

        {!crowdLevel && (
          <p className="text-center text-white/30 text-xs" aria-live="polite">
            Select a crowd level to continue
          </p>
        )}
      </div>
    </div>
  );
}

// --------------- Page export --------------------------------

export default function VibeCheckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}>
      <CheckInInner />
    </Suspense>
  );
}
