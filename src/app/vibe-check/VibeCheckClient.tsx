"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue, CrowdFeel, ReportedBusyness } from "@/types";

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

const BUSYNESS_OPTIONS: BusynessOption[] = [
  { value: "dead", label: "Dead", submitValue: "dead", crowdLevel: "quiet", accent: "#4ADE80", ring: "rgba(74,222,128,0.14)" },
  { value: "moderate", label: "Moderate", submitValue: "moderate", crowdLevel: "moderate", accent: "#FBBF24", ring: "rgba(251,191,36,0.14)" },
  { value: "packed", label: "Packed", submitValue: "packed", crowdLevel: "packed", accent: "#F87171", ring: "rgba(248,113,113,0.14)" },
];

const CROWD_OPTIONS: {
  value: CrowdFeel;
  label: string;
  ariaLabel?: string;
}[] = [
  { value: "mostly_male", label: "👨 More guys" },
  { value: "mixed", label: "⚖️ Mixed" },
  { value: "mostly_female", label: "👩 More women", ariaLabel: "👩 More women, more girls" },
];

const NOTE_MAX_LENGTH = 140;

export default function VibeCheckClient({
  initialVenueId,
  initialVenueName,
  returnPath,
}: VibeCheckClientProps) {
  const router = useRouter();
  const track = useTrack();

  const venueId = initialVenueId;
  const venueName = initialVenueName;

  // Stable sessionId for this check-in form instance
  const sessionId = useRef(crypto.randomUUID());

  const [venueSearch, setVenueSearch] = useState("");
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState("");

  const [busyness, setBusyness] = useState<BusynessOption["value"] | null>(null);
  const [crowdFeel, setCrowdFeel] = useState<CrowdFeel | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<{ type: "duplicate" | "generic"; msg: string } | null>(null);

  useEffect(() => {
    if (venueId) return;
    let active = true;
    setVenuesLoading(true);
    setVenuesError(null);

    fetch("/api/venues")
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
  const effectiveVenueName = venueId ? venueName : selectedVenue?.name ?? "";
  const selectedBusyness = BUSYNESS_OPTIONS.find((option) => option.value === busyness);
  const venueBackHref = effectiveVenueId ? `/venues/${encodeURIComponent(effectiveVenueId)}` : "/explore";
  const venueBackLabel = effectiveVenueName ? `Back to ${effectiveVenueName}` : "Back to venues";

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
      const client = createBrowserClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        // Auth gate — redirect to login with return URL
        router.push(`/login?return=${encodeURIComponent(returnPath)}`);
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
          busyness: selectedBusyness?.submitValue,
          // TODO: remove crowdLevel once dev-tech-agent updates the API to accept the visible four-choice UI directly.
          crowdLevel: selectedBusyness?.crowdLevel,
          crowdFeel: crowdFeel ?? "mixed",
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
      void track("checkin_submit", { venueId: effectiveVenueId });
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
    selectedBusyness,
    track,
  ]);

  if (done) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm items-center">
          <section className="w-full rounded-2xl border border-[#00F5D4]/35 bg-[#00F5D4]/10 px-6 py-8 text-center shadow-[0_0_32px_rgba(0,245,212,0.16)]">
            <p className="mb-3 truncate text-[17px] font-medium text-white/80">
              {effectiveVenueName || "This venue"}
            </p>
            <h1 className="text-2xl font-black">Vibe logged 🎯</h1>
            <p className="mt-2 text-sm font-semibold text-white/70">Thanks for keeping it real.</p>
            <Link
              href={venueBackHref}
              className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#00F5D4] px-4 py-3 text-sm font-black text-[#0A0A0F] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
            >
              {venueBackLabel}
            </Link>
            <Link href="/explore" className="mt-3 block text-center text-sm text-white/50 underline">
              Report another vibe
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-sm items-center gap-3 px-4">
          <Link href="/explore" className="text-sm font-semibold text-white/55 hover:text-white">
            Back
          </Link>
          <h1 className="truncate text-base font-bold text-[#F9FAFB]">
            {venueName || "Report Vibe"}
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Venue
          </h2>
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
            <div className="space-y-3">
              <label
                htmlFor="venue-search"
                className="sr-only"
              >
                Search South End venues
              </label>
              <input
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
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-white/30 focus:border-[#7C3AED]/60 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30"
              />

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
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
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60 ${
                        selected
                          ? "border-2 border-[#7C3AED] bg-[#7C3AED]/18"
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
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
                  className={`min-h-[52px] w-full rounded-xl border px-4 py-3 text-base font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
                    selected
                      ? "border-2 bg-white/[0.04] shadow-[0_0_18px_rgba(0,245,212,0.12)]"
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
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
                  className={`min-h-[52px] rounded-xl border px-3 py-3 text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
                    selected
                      ? "border-2 border-[#00F5D4] bg-[#00F5D4]/12 text-white"
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
              <span className="font-normal normal-case tracking-normal text-white/25">
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
            className="min-h-[112px] w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-[#F9FAFB] placeholder:text-white/30 focus:border-[#00F5D4]/70 focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-white/30">{note.length} / {NOTE_MAX_LENGTH}</p>
        </section>

        {/* ── SUBMIT ────────────────────────────────────────────── */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          aria-describedby={submitError ? "submit-error" : undefined}
          className="min-h-[56px] w-full rounded-xl bg-[#00F5D4] px-4 py-4 text-base font-black text-[#0A0A0F] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting..." : canSubmit ? "✓ Submit Vibe" : "Select a vibe to continue"}
        </button>

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
