"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { CrowdFeel, ReportedBusyness } from "@/types";

export const dynamic = "force-dynamic";

// Mapping from ReportedBusyness to the crowdLevel value the API expects
const CROWD_LEVEL_MAP: Record<ReportedBusyness, string> = {
  dead: "quiet",
  moderate: "moderate",
  packed: "packed",
};

// Busyness buttons — stacked full-width, each with its own color identity
const BUSYNESS_OPTIONS: {
  value: ReportedBusyness;
  label: string;
  // rgba values for bg (unselected /15, selected /30) and border color
  colorRgb: string;
  borderHex: string;
}[] = [
  { value: "dead",     label: "DEAD",     colorRgb: "107,114,128", borderHex: "#6B7280" },
  { value: "moderate", label: "MODERATE", colorRgb: "245,158,11",  borderHex: "#F59E0B" },
  { value: "packed",   label: "PACKED",   colorRgb: "239,68,68",   borderHex: "#EF4444" },
];

const CROWD_OPTIONS: {
  value: CrowdFeel;
  label: string;
  bgRgba: string;
}[] = [
  { value: "mostly_male",   label: "MOSTLY GUYS",  bgRgba: "59,130,246,0.2"  },
  { value: "mostly_female", label: "MOSTLY GIRLS", bgRgba: "236,72,153,0.2"  },
  { value: "balanced",      label: "BALANCED",     bgRgba: "255,255,255,0.06" },
  { value: "mixed",         label: "MIXED",        bgRgba: "255,255,255,0.06" },
];

function CheckInInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const venueId = searchParams.get("venueId") ?? "";
  const venueName = decodeURIComponent(searchParams.get("venueName") ?? "");

  // Stable sessionId for this check-in form instance
  const sessionId = useRef(crypto.randomUUID());

  // Venue text input — only used when no venueId param
  const [venueInput, setVenueInput] = useState("");

  const [busyness, setBusyness] = useState<ReportedBusyness | null>(null);
  const [crowdFeel, setCrowdFeel] = useState<CrowdFeel | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<{ type: "duplicate" | "generic"; msg: string } | null>(null);

  const effectiveVenueId = venueId || "";
  const effectiveVenueName = venueId ? venueName : venueInput.trim();

  // Submit is enabled when busyness + crowdFeel + (venueId or typed venue name)
  const canSubmit = Boolean(
    (effectiveVenueId || venueInput.trim()) &&
    busyness &&
    crowdFeel &&
    !submitting &&
    !done
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const client = createBrowserClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        // Auth gate — redirect to login with return URL
        const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
        router.push(`/login?return=${encodeURIComponent(pathname + search)}`);
        return;
      }

      const res = await fetch("/api/check-ins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          venueId: effectiveVenueId || undefined,
          venueName: effectiveVenueName || undefined,
          busyness,
          // TODO: remove crowdLevel once dev-tech-agent updates the API to accept raw busyness
          crowdLevel: busyness ? CROWD_LEVEL_MAP[busyness] : undefined,
          crowdFeel,
          note: note.trim() || undefined,
          sessionId: sessionId.current,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 429 && json?.error?.code === "DUPLICATE_CHECK_IN") {
          setSubmitError({
            type: "duplicate",
            msg: "You already reported this spot recently. Try again in a few minutes.",
          });
        } else {
          setSubmitError({
            type: "generic",
            msg: json?.error?.message ?? "Couldn't submit — tap to retry",
          });
        }
        return;
      }

      setDone(true);
      // Redirect to venue page after 2 seconds; fall back to home if no venueId
      const dest = effectiveVenueId ? `/venues/${effectiveVenueId}` : "/";
      setTimeout(() => router.push(dest), 2000);
    } catch {
      setSubmitError({ type: "generic", msg: "Couldn't submit — tap to retry" });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    busyness,
    crowdFeel,
    effectiveVenueId,
    effectiveVenueName,
    note,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-sm items-center gap-3 px-4">
          <Link href="/" className="text-sm font-semibold text-white/55 hover:text-white">
            Back
          </Link>
          <h1 className="truncate text-base font-bold text-[#F9FAFB]">
            {venueName || "Report Vibe"}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-sm space-y-8 px-4 py-6 pb-28">

        {/* ── VENUE ─────────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Venue
          </p>
          {venueId ? (
            // Read-only locked display when venueId param is present
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB]">
              <span className="flex-1 truncate">{venueName || venueId}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-white/30"
              >
                <path
                  d="M10.5 6.5V4a3.5 3.5 0 1 0-7 0v2.5M2.5 6.5h9a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          ) : (
            // Plain text input when no venueId param
            <input
              type="text"
              value={venueInput}
              onChange={(e) => setVenueInput(e.target.value)}
              placeholder="Venue name"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-white/30 focus:border-[#7C3AED]/60 focus:outline-none"
            />
          )}
        </section>

        {/* ── BUSYNESS ──────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            How busy is it?
          </p>
          <div className="flex flex-col gap-3">
            {BUSYNESS_OPTIONS.map((opt) => {
              const selected = busyness === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBusyness(opt.value)}
                  aria-pressed={selected}
                  style={
                    selected
                      ? {
                          backgroundColor: `rgba(${opt.colorRgb},0.3)`,
                          borderColor: opt.borderHex,
                        }
                      : {
                          backgroundColor: `rgba(${opt.colorRgb},0.15)`,
                          borderColor: `rgba(${opt.colorRgb.split(",").concat(["0.4"]).join(",")})`,
                        }
                  }
                  className={`min-h-[64px] w-full rounded-xl border text-base font-black tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    selected ? "border-2 text-white" : "text-white/60 hover:text-white/80"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── CROWD FEEL ────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Crowd feel
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CROWD_OPTIONS.map((opt) => {
              const selected = crowdFeel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCrowdFeel(opt.value)}
                  aria-pressed={selected}
                  style={{
                    backgroundColor: selected
                      ? `rgba(${opt.bgRgba})`
                      : `rgba(${opt.bgRgba.replace(/[\d.]+$/, "0.10")})`,
                  }}
                  className={`min-h-[64px] rounded-xl border text-sm font-black uppercase tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    selected
                      ? "border-2 border-white/30 text-white"
                      : "border border-white/[0.12] text-white/55 hover:text-white/80"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── NOTE ──────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="note"
              className="text-xs font-semibold uppercase tracking-widest text-white/40"
            >
              Note{" "}
              <span className="font-normal normal-case tracking-normal text-white/25">
                (optional)
              </span>
            </label>
          </div>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            rows={2}
            placeholder="What's the vibe?"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-white/30 focus:border-[#7C3AED]/60 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-white/30">{note.length}/120</p>
        </section>

        {/* ── SUBMIT ────────────────────────────────────────────── */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="min-h-[52px] w-full rounded-xl bg-[#7C3AED] text-base font-black text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting..." : "Report Vibe"}
        </button>

        {/* Inline success */}
        {done && (
          <p className="text-center text-sm font-semibold text-[#7C3AED]">Vibe reported ✓</p>
        )}

        {/* Inline errors */}
        {submitError && (
          <p
            role="alert"
            className={`text-center text-sm ${
              submitError.type === "duplicate" ? "text-amber-400" : "text-rose-400"
            }`}
          >
            {submitError.msg}
          </p>
        )}
      </main>
    </div>
  );
}

export default function VibeCheckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}>
      <CheckInInner />
    </Suspense>
  );
}
