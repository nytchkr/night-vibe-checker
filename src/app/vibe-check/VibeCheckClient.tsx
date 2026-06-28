"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { track } from "@vercel/analytics";
import { button as MotionButton } from "framer-motion/client";
import { Share2 } from "lucide-react";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";
import { useHaptic } from "@/hooks/useHaptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { APIResponse, ConsumerVenue, CrowdFeel, ReportedBusyness, VenueSignal } from "@/types";

type VibeCheckClientProps = {
  initialVenueId: string;
  initialVenueName: string;
  returnPath: string;
};

type BusynessOption = {
  value: "dead" | "moderate" | "packed";
  submitValue: ReportedBusyness;
  crowdLevel: "quiet" | "moderate" | "packed";
  label: string;
  accent: string;
  ring: string;
};

type CrowdCompositionFeel = Extract<CrowdFeel, "mostly_male" | "mostly_female" | "balanced" | "mixed">;

const BUSYNESS_OPTIONS: BusynessOption[] = [
  { value: "dead", label: "Dead", submitValue: "dead", crowdLevel: "quiet", accent: "#5C6573", ring: "rgba(92,101,115,0.14)" },
  { value: "moderate", label: "Moderate", submitValue: "moderate", crowdLevel: "moderate", accent: "#FFB020", ring: "rgba(255,176,32,0.14)" },
  { value: "packed", label: "Packed", submitValue: "packed", crowdLevel: "packed", accent: "#FF5B6A", ring: "rgba(255,91,106,0.14)" },
];

const CROWD_OPTIONS: {
  value: CrowdCompositionFeel;
  label: string;
  ariaLabel?: string;
}[] = [
  { value: "mostly_male", label: "👨 More guys" },
  { value: "mixed", label: "⚖️ Mixed" },
  { value: "mostly_female", label: "👩 More women", ariaLabel: "👩 More women, more girls" },
];

const NOTE_MAX_LENGTH = 140;

type GenderSelfReport = "m" | "f" | null;

const GENDER_SELF_REPORT_OPTIONS: {
  value: GenderSelfReport;
  label: string;
  description: string;
}[] = [
  { value: "m", label: "Man", description: "Count me as M tonight" },
  { value: "f", label: "Woman", description: "Count me as F tonight" },
  { value: null, label: "Skip", description: "Do not include me in crowd mix" },
];

const BUSYNESS_SHARE_COPY: Record<ReportedBusyness, { emoji: string; label: string }> = {
  dead: { emoji: "🟢", label: "It's Easy Tonight" },
  moderate: { emoji: "🟡", label: "It's Warming Up" },
  packed: { emoji: "🔴", label: "It's Packed Tonight" },
};

const CROWD_SHARE_COPY: Record<CrowdCompositionFeel, { emoji: string; label: string }> = {
  mostly_male: { emoji: "👨", label: "More Guys" },
  balanced: { emoji: "⚖️", label: "Balanced Crowd" },
  mixed: { emoji: "⚖️", label: "Balanced Crowd" },
  mostly_female: { emoji: "👩", label: "More Women" },
};

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function isDuplicateCheckInError(status: number, json: APIResponse<unknown>) {
  if (status !== 429) return false;

  const code = json.error?.code;
  const message = json.error?.message?.toLowerCase() ?? "";
  return (
    code === "DUPLICATE_CHECK_IN" ||
    (message.includes("already reported") && message.includes("recent"))
  );
}

function SignalPreview({ signal }: { signal: VenueSignal | null }) {
  if (!signal) {
    return (
      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.045] px-4 py-4 text-left">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Live signal</p>
        <p className="mt-2 text-sm font-semibold text-white/60">Updating the venue signal...</p>
      </div>
    );
  }

  const busynessPercent = signal.busyness0To100 == null ? null : clampPercent(signal.busyness0To100);
  const malePercent = signal.sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO && signal.mfRatio != null ? clampPercent(signal.mfRatio) : null;
  const femalePercent = malePercent == null ? null : 100 - malePercent;

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.045] px-4 py-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#00F5D4]">Live signal updated</p>
          <p className="mt-1 text-sm font-semibold text-white/55">
            {signal.sampleSize} {signal.sampleSize === 1 ? "report" : "reports"}
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-300">
          {signal.busynessSource ?? "crowd"}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-black text-white">Busyness</p>
          <p className="text-sm font-black text-white">
            {busynessPercent == null ? "--" : busynessPercent}
            <span className="text-xs text-white/35">/100</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="h-full rounded-full bg-[#00F5D4]"
            style={{ width: `${busynessPercent ?? 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-black text-white">Crowd read</p>
        {malePercent == null || femalePercent == null ? (
          <p className="mt-2 text-sm font-semibold text-white/50">No M/F read yet</p>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold">
              <span style={{ color: "#8B6CFF" }}>~{malePercent}% M</span>
              <span className="text-white/35"> / </span>
              <span style={{ color: "#F0568C" }}>~{femalePercent}% F</span>
            </p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div className="h-full bg-[#8B6CFF]" style={{ width: `${malePercent}%` }} />
              <div className="h-full bg-[#F0568C]" style={{ width: `${femalePercent}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VibeCheckClient({
  initialVenueId,
  initialVenueName,
  returnPath,
}: VibeCheckClientProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const haptic = useHaptic();
  const prefersReduced = useReducedMotion();

  const venueId = initialVenueId;
  const venueName = initialVenueName;

  // Stable sessionId for this check-in form instance
  const sessionId = useRef(crypto.randomUUID());

  const [venueSearch, setVenueSearch] = useState("");
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [lockedVenue, setLockedVenue] = useState<ConsumerVenue | null>(null);
  const [lockedVenueLoading, setLockedVenueLoading] = useState(false);

  const [busyness, setBusyness] = useState<BusynessOption["value"] | null>(null);
  const [crowdFeel, setCrowdFeel] = useState<CrowdCompositionFeel | null>(null);
  const [note, setNote] = useState("");
  const [genderSelfReport, setGenderSelfReport] = useState<GenderSelfReport>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [submitError, setSubmitError] = useState<{ type: "duplicate" | "generic"; msg: string } | null>(null);
  const [submittedSignal, setSubmittedSignal] = useState<VenueSignal | null>(null);

  // Client-side auth gate — redirect unauthenticated users to sign-in.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/sign-in?return=${encodeURIComponent(returnPath)}`);
    }
  }, [router, returnPath, status]);

  useEffect(() => {
    if (venueId) return;
    let active = true;
    setVenuesLoading(true);
    setVenuesError(null);

    fetch("/api/venues", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!active) return;
        setVenues(json?.data?.venues ?? []);
      })
      .catch(() => {
        if (active) setVenuesError("Could not load venues.");
      })
      .finally(() => {
        if (active) setVenuesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [venueId]);

  useEffect(() => {
    if (!venueId || venueName) {
      setLockedVenue(null);
      return;
    }

    let active = true;
    setLockedVenueLoading(true);

    fetch(`/api/venues/${encodeURIComponent(venueId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<APIResponse<{ venue: ConsumerVenue }>>;
      })
      .then((json) => {
        if (!active) return;
        setLockedVenue(json.data?.venue ?? null);
      })
      .catch(() => {
        if (active) setLockedVenue(null);
      })
      .finally(() => {
        if (active) setLockedVenueLoading(false);
      });

    return () => {
      active = false;
    };
  }, [venueId, venueName]);

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [selectedVenueId, venues],
  );

  const filteredVenues = useMemo(() => {
    const query = venueSearch.trim().toLowerCase();
    const matches = query
      ? venues.filter((venue) => (
          venue.name.toLowerCase().includes(query) ||
          venue.address.toLowerCase().includes(query)
        ))
      : venues;

    return matches.slice(0, 8);
  }, [venueSearch, venues]);

  const effectiveVenueId = venueId || selectedVenue?.id || "";
  const effectiveVenueName = venueId ? (venueName || lockedVenue?.name || "") : selectedVenue?.name ?? "";
  const effectiveSignal = submittedSignal ?? lockedVenue?.signal ?? selectedVenue?.signal ?? null;
  const selectedBusyness = BUSYNESS_OPTIONS.find((option) => option.value === busyness);
  const venueBackHref = effectiveVenueId ? `/venues/${encodeURIComponent(effectiveVenueId)}` : "/explore";
  const venueBackLabel = effectiveVenueName ? `Back to ${effectiveVenueName}` : "Back to venues";
  const shareBusyness = BUSYNESS_SHARE_COPY[selectedBusyness?.submitValue ?? "moderate"];
  const shareCrowd = CROWD_SHARE_COPY[crowdFeel ?? "mixed"];

  // Submit is enabled once a real venue and the required busyness signal are present.
  const canSubmit = Boolean(
    effectiveVenueId &&
    busyness &&
    !submitting &&
    !done
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!session?.user?.id) {
        router.push(`/sign-in?return=${encodeURIComponent(returnPath)}`);
        return;
      }

      const res = await fetch("/api/check-ins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          venueId: effectiveVenueId || undefined,
          venueName: effectiveVenueName || undefined,
          busyness: selectedBusyness?.submitValue,
          crowdLevel: selectedBusyness?.crowdLevel,
          crowdFeel: crowdFeel ?? "mixed",
          note: note.trim() || undefined,
          genderSelfReport,
          sessionId: sessionId.current,
        }),
      });

      const json = await res.json().catch(() => ({} as APIResponse<{ signal?: VenueSignal }>));

      if (!res.ok) {
        if (isDuplicateCheckInError(res.status, json)) {
          setSubmitError({
            type: "duplicate",
            msg: "You already reported the vibe here recently — come back in a bit!",
          });
        } else {
          setSubmitError({
            type: "generic",
            msg: json.error?.message ?? "Couldn't submit — tap to retry",
          });
        }
        return;
      }

      setSubmittedSignal(json.data?.signal ?? null);
      haptic.success();
      setDone(true);
      trackAnalytics("vibe_check_submitted", {
        venue_id: effectiveVenueId,
        busyness_level: selectedBusyness?.submitValue ?? "",
        crowd_feel: crowdFeel ?? "mixed",
      });
    } catch {
      setSubmitError({ type: "generic", msg: "Couldn't submit — tap to retry" });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    crowdFeel,
    effectiveVenueId,
    effectiveVenueName,
    note,
    returnPath,
    router,
    session?.user?.id,
    selectedBusyness,
    haptic,
    genderSelfReport,
  ]);

  const handleShareCard = useCallback(async () => {
    const venueUrl = typeof window !== "undefined"
      ? new URL(venueBackHref, window.location.origin).toString()
      : venueBackHref;
    const venueTitle = effectiveVenueName || "nytchkr";
    const shareData = {
      title: `nytchkr: ${venueTitle}`,
      text: `${shareBusyness.emoji} ${shareBusyness.label} at ${venueTitle}. ${shareCrowd.emoji} ${shareCrowd.label}.`,
      url: venueUrl,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        trackAnalytics("share_card_shared", {
          venue_id: effectiveVenueId,
          method: "native",
        });
        return;
      } catch {
        // If native share is cancelled or blocked, fall back to copying the venue link.
      }
    }

    try {
      await navigator.clipboard.writeText(venueUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
      trackAnalytics("share_card_shared", {
        venue_id: effectiveVenueId,
        method: "clipboard",
      });
    } catch {
      setShareCopied(false);
    }
  }, [
    effectiveVenueId,
    effectiveVenueName,
    shareBusyness,
    shareCrowd,
    venueBackHref,
  ]);

  if (done) {
    return (
      <div className="min-h-screen-safe bg-[#0A0A0E] px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm items-center">
          <section className="w-full rounded-2xl border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 px-6 py-8 text-center shadow-[0_0_32px_rgba(139,108,255,0.16)]">
            <p className="mb-3 truncate text-[17px] font-medium text-white/80">
              {effectiveVenueName || "This venue"}
            </p>
            <h1 className="font-display text-2xl font-black">Vibe reported!</h1>
            <p className="mt-2 text-sm font-semibold text-white/70">Thanks. The live read is updated now.</p>

            <SignalPreview signal={effectiveSignal} />

            <article
              aria-describedby="vibe-report-card-description"
              className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111118] p-6 text-left shadow-[0_22px_48px_rgba(0,0,0,0.34)]"
            >
              <p id="vibe-report-card-description" className="sr-only">
                Your vibe report card
              </p>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8B6CFF]">
                    Tonight's read
                  </p>
                  <h2 className="font-display mt-3 truncate text-xl font-black text-white">
                    {effectiveVenueName || "This venue"}
                  </h2>
                </div>
                <div className="rounded-full border border-[#F0568C]/35 bg-[#F0568C]/12 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#FF8AB7]">
                  Live
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.045] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">{shareBusyness.emoji}</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Busyness</p>
                      <p className="mt-0.5 text-base font-black text-white">{shareBusyness.label}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.045] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">{shareCrowd.emoji}</span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Crowd feel</p>
                      <p className="mt-0.5 text-base font-black text-white">{shareCrowd.label}</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-6 text-xs font-semibold text-white/35">
                <span className="font-display">nytchkr</span> · South End Charlotte
              </p>
            </article>

            <button
              type="button"
              onClick={() => void handleShareCard()}
              className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#111117] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#171720] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {shareCopied ? "Link copied" : "Share"}
            </button>
            <Link
              href={venueBackHref}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              {venueBackLabel}
            </Link>
            <Link
              href="/explore"
              className="mt-3 block text-center text-sm text-white/50 underline"
            >
              Report another vibe
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-sm items-center gap-3 px-4">
          <Link href="/explore" className="text-sm font-semibold text-white/55 hover:text-white">
            Back
          </Link>
          <h1 className="font-display truncate text-base font-bold text-[#F9FAFB]">
            {effectiveVenueName || "Report Vibe"}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-sm space-y-8 px-4 py-6 pb-28">
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                Reporting for
              </p>
              <p className="mt-1 truncate text-[17px] font-medium text-white">
                {effectiveVenueName || "Choose a venue"}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide"
              style={{
                borderColor: selectedBusyness?.accent ?? "rgba(255,255,255,0.16)",
                color: selectedBusyness?.accent ?? "rgba(255,255,255,0.42)",
                backgroundColor: selectedBusyness ? selectedBusyness.ring : "rgba(255,255,255,0.04)",
              }}
            >
              {selectedBusyness?.label ?? "Select vibe"}
            </span>
          </div>
        </section>

        {/* ── VENUE ─────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Venue
          </h2>
          {venueId ? (
            // Read-only locked display when venueId param is present
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB]">
              <span className="flex-1 truncate">
                {effectiveVenueName || (lockedVenueLoading ? "Loading venue..." : venueId)}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-white/35"
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
            <div className="space-y-3">
              <label
                htmlFor="venue-search"
                className="sr-only"
              >
                Search South End venues
              </label>
              <input aria-label="Search South End venues"
                id="venue-search"
                type="search"
                value={venueSearch}
                onChange={(e) => {
                  setVenueSearch(e.target.value);
                  setSelectedVenueId("");
                }}
                placeholder="Search South End venues"
                aria-describedby={venuesError ? "venue-search-error" : undefined}
                aria-invalid={venuesError ? "true" : "false"}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-[#9CA2AE] focus:border-[#8B6CFF]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              />

              <div className="scroll-touch max-h-64 space-y-2 overflow-y-auto pr-1 [will-change:scroll-position]">
                {venuesLoading && (
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/40">
                    Loading venues...
                  </p>
                )}

                {!venuesLoading && venuesError && (
                  <p id="venue-search-error" role="alert" className="rounded-xl border border-rose-500/35 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                    {venuesError}
                  </p>
                )}

                {!venuesLoading && !venuesError && filteredVenues.map((venue) => {
                  const selected = selectedVenueId === venue.id;
                  return (
                    <button
                      key={venue.id}
                      type="button"
                      onClick={() => {
                        setSelectedVenueId(venue.id);
                        setVenueSearch(venue.name);
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                        selected
                          ? "border-2 border-[#8B6CFF] bg-[#8B6CFF]/18"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                      }`}
                      aria-pressed={selected}
                    >
                      <span className="block truncate text-sm font-bold text-white">{venue.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-white/38">{venue.address}</span>
                    </button>
                  );
                })}

                {!venuesLoading && !venuesError && filteredVenues.length === 0 && (
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/40">
                    No matching venues.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── BUSYNESS ──────────────────────────────────────────── */}
        <section>
          <h2 className="font-display mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            How busy is it?
          </h2>
          <div className="flex flex-col gap-3">
            {BUSYNESS_OPTIONS.map((opt) => {
              const selected = busyness === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBusyness(opt.value)}
                  aria-pressed={selected}
                  className={`min-h-[52px] w-full rounded-xl border px-4 py-3 text-base font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                    selected
                      ? "border-2 bg-white/[0.04] shadow-[0_0_18px_rgba(139,108,255,0.12)]"
                      : "border-white/[0.12] bg-white/[0.04] text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                  style={selected ? {
                    borderColor: opt.accent,
                    color: opt.accent,
                    boxShadow: `0 0 18px ${opt.ring}`,
                  } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── CROWD FEEL ────────────────────────────────────────── */}
        <section>
          <h2 className="font-display mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Crowd feel
          </h2>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
            {CROWD_OPTIONS.map((opt) => {
              const selected = crowdFeel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCrowdFeel(opt.value)}
                  aria-pressed={selected}
                  aria-label={opt.ariaLabel}
                  className={`min-h-[52px] rounded-xl border px-3 py-3 text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                    selected
                      ? "border-2 border-[#8B6CFF] bg-[#8B6CFF]/12 text-white"
                      : "border-white/[0.12] bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
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
              <span className="font-normal normal-case tracking-normal text-white/35">
                (optional)
              </span>
            </label>
          </div>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX_LENGTH}
            rows={4}
            placeholder="Add a vibe note (optional)..."
            className="min-h-[112px] w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-[#9CA2AE] focus:border-[#8B6CFF]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          />
          <p className="mt-1 text-right text-[11px] text-white/35">{note.length} / {NOTE_MAX_LENGTH}</p>
        </section>

        {/* ── GENDER SELF-REPORT ───────────────────────────────── */}
        <section>
          <div className="mb-3 space-y-1">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-white/40">
              Step 3{" "}
              <span className="font-normal normal-case tracking-normal text-white/35">
                (optional)
              </span>
            </p>
            <h2 className="text-base font-black text-white">
              Help us track the crowd mix — what best describes you tonight?
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
            {GENDER_SELF_REPORT_OPTIONS.map((opt) => {
              const selected = genderSelfReport === opt.value;
              const isSkip = opt.value == null;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setGenderSelfReport(opt.value)}
                  aria-pressed={selected}
                  className={`min-h-[58px] rounded-xl border px-3 py-3 text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                    selected
                      ? isSkip
                        ? "border-2 border-[#00F5D4] bg-[#00F5D4]/12 text-[#00F5D4]"
                        : "border-2 border-[#8B6CFF] bg-[#8B6CFF]/12 text-white"
                      : isSkip
                        ? "border-[#00F5D4]/45 bg-[#00F5D4]/10 text-[#00F5D4] hover:border-[#00F5D4]"
                        : "border-white/[0.12] bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <span className="block">{opt.label}</span>
                  <span className="mt-1 block text-[10px] font-semibold leading-tight text-current opacity-60">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── SUBMIT ────────────────────────────────────────────── */}
        <MotionButton
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          whileTap={prefersReduced ? undefined : { scale: 0.96 }}
          transition={{ duration: prefersReduced ? 0 : 0.12, ease: "easeOut" }}
          aria-describedby={submitError ? "submit-error" : undefined}
          className="min-h-[56px] w-full rounded-xl bg-[#8B6CFF] px-4 py-4 text-base font-black text-[#0A0A0E] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting..." : canSubmit ? "✓ Submit Vibe" : "Select a vibe to continue"}
        </MotionButton>

        {/* Inline errors */}
        {submitError && (
          <p
            id="submit-error"
            role="alert"
            className={`text-center text-sm ${
              submitError.type === "duplicate" ? "text-amber-400" : "text-rose-400"
            }`}
          >
            {submitError.msg}
          </p>
        )}
      </div>
    </div>
  );
}
