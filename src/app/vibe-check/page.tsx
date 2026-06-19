"use client";

// ============================================================
// Check-in Page  (/vibe-check)  — NV-041
//
// Refactored from AI-report demo to live check-in flow:
//   Step 1 — Venue picker (search / pre-fill from URL)
//   Step 2 — Quick report form:
//             crowd level (4 tap buttons)
//             vibe score (1-10 slider)
//             music type (optional chips)
//             wait time (optional chips)
//   Step 3 — Confirmation: "Vibe Logged!"
//
// AI analysis (OpenAI) still runs in the background after
// submission via /api/vibe-check, but the primary UX is the
// manual check-in form, not the AI wait screen.
//
// NV-042 check-ins API not live yet — submits optimistically
// and shows confirmation immediately. Will wire to
// POST /api/check-ins once NV-042 lands.
// ============================================================

import { useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Toast } from "@/components/Toast";
export const dynamic = "force-dynamic";

// --------------- Types --------------------------------------

type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";
type MusicType = "house" | "hiphop" | "mixed" | "live" | "other";
type WaitTime = "none" | "lt5" | "5to15" | "15plus";

interface CheckInForm {
  crowdLevel: CrowdLevel | null;
  vibeScore: number;
  musicType: MusicType | null;
  waitTime: WaitTime | null;
}

const EMPTY_FORM: CheckInForm = {
  crowdLevel: null,
  vibeScore: 7,
  musicType: null,
  waitTime: null,
};

// --------------- Crowd level config -------------------------

const CROWD_OPTIONS: { value: CrowdLevel; label: string; color: string; bg: string; glow: string }[] = [
  { value: "quiet",    label: "Quiet",    color: "#4ade80", bg: "rgba(34,197,94,0.15)",   glow: "0 0 16px rgba(34,197,94,0.4)"    },
  { value: "moderate", label: "Moderate", color: "#fbbf24", bg: "rgba(251,191,36,0.15)",  glow: "0 0 16px rgba(251,191,36,0.35)"  },
  { value: "packed",   label: "Packed",   color: "#fb923c", bg: "rgba(249,115,22,0.15)",  glow: "0 0 16px rgba(249,115,22,0.4)"   },
  { value: "wild",     label: "Wild",     color: "#FF2D78", bg: "rgba(255,45,120,0.18)",  glow: "0 0 16px rgba(255,45,120,0.5)"   },
];

// --------------- Music type config --------------------------

const MUSIC_OPTIONS: { value: MusicType; label: string }[] = [
  { value: "house",   label: "House"   },
  { value: "hiphop",  label: "Hip-Hop" },
  { value: "mixed",   label: "Mixed"   },
  { value: "live",    label: "Live"    },
  { value: "other",   label: "Other"   },
];

// --------------- Wait time config ---------------------------

const WAIT_OPTIONS: { value: WaitTime; label: string }[] = [
  { value: "none",    label: "None"    },
  { value: "lt5",     label: "< 5 min" },
  { value: "5to15",   label: "5–15 min" },
  { value: "15plus",  label: "15+ min"  },
];

function waitTimeToMinutes(waitTime: WaitTime | null): number | undefined {
  if (!waitTime || waitTime === "none") return 0;
  if (waitTime === "lt5") return 5;
  if (waitTime === "5to15") return 15;
  return 30;
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

// --------------- Chip button --------------------------------

function ChipButton<T extends string>({
  value,
  selected,
  label,
  onSelect,
  activeColor,
  activeBg,
  activeGlow,
}: {
  value: T;
  selected: boolean;
  label: string;
  onSelect: (v: T) => void;
  activeColor?: string;
  activeBg?: string;
  activeGlow?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={`
        flex-1 min-h-[44px] rounded-xl text-sm font-semibold
        border transition-all duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50
        active:scale-95
        ${selected
          ? "border-transparent"
          : "bg-white/[0.06] border-white/10 text-white/60 hover:bg-white/[0.09] hover:text-white/80"
        }
      `}
      style={
        selected
          ? {
              background: activeBg ?? "rgba(0,245,212,0.18)",
              color: activeColor ?? "#00F5D4",
              borderColor: activeColor ?? "#00F5D4",
              boxShadow: activeGlow ?? "0 0 14px rgba(0,245,212,0.4)",
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

// --------------- Venue step ---------------------------------

function VenueStep({
  venueName,
  onChangeName,
  onContinue,
}: {
  venueName: string;
  onChangeName: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center py-4 space-y-2">
        <div className="text-4xl mb-2" aria-hidden="true" style={{ filter: "drop-shadow(0 0 18px rgba(0,245,212,0.5))" }}>
          📍
        </div>
        <h2 className="text-white font-black text-2xl tracking-[-0.01em]" style={{ textShadow: "0 0 30px rgba(0,245,212,0.2)" }}>
          Where are you?
        </h2>
        <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed">
          Enter the venue name to report the current vibe.
        </p>
      </div>

      <div
        className="rounded-2xl border border-white/10 p-5 space-y-5"
        style={{
          background: "linear-gradient(145deg, rgba(0,245,212,0.04), rgba(255,255,255,0.03) 50%, rgba(168,85,247,0.04))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="venueName" className="block text-sm font-medium text-white/70">
            Venue name <span className="text-rose-400" aria-hidden="true">*</span>
          </label>
          <input
            id="venueName"
            type="text"
            required
            value={venueName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. The Midnight Lounge"
            className="w-full px-4 py-3 rounded-xl text-white text-sm bg-white/[0.07] border border-white/10 placeholder:text-white/30 focus:outline-none focus:border-[#00F5D4]/60 focus:ring-1 focus:ring-[#00F5D4]/30 transition-colors duration-150"
            autoComplete="off"
          />
        </div>

        <button
          type="button"
          disabled={!venueName.trim()}
          onClick={onContinue}
          className="w-full min-h-[52px] rounded-xl font-black text-[#0A0A0F] text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)",
            boxShadow: venueName.trim() ? "0 0 28px rgba(0,245,212,0.5), 0 0 56px rgba(0,245,212,0.15)" : undefined,
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// --------------- Quick report form (Step 2) -----------------

function ReportForm({
  venueName,
  form,
  onChange,
  onSubmit,
  submitting,
}: {
  venueName: string;
  form: CheckInForm;
  onChange: (patch: Partial<CheckInForm>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Venue label */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[#00F5D4]/60 text-xs" aria-hidden="true">📍</span>
        <p className="text-white font-semibold text-sm truncate">{venueName}</p>
      </div>

      {/* Crowd level */}
      <section aria-labelledby="crowd-label">
        <p id="crowd-label" className="text-white/70 text-sm font-semibold mb-3">
          How packed is it? <span className="text-rose-400" aria-hidden="true">*</span>
        </p>
        <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="crowd-label">
          {CROWD_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              value={opt.value}
              label={opt.label}
              selected={form.crowdLevel === opt.value}
              onSelect={(v) => onChange({ crowdLevel: v })}
              activeColor={opt.color}
              activeBg={opt.bg}
              activeGlow={opt.glow}
            />
          ))}
        </div>
      </section>

      {/* Vibe score */}
      <section aria-labelledby="vibe-label">
        <div className="flex items-center justify-between mb-3">
          <p id="vibe-label" className="text-white/70 text-sm font-semibold">Vibe score</p>
          <span
            className="text-[#00F5D4] font-black text-xl tabular-nums"
            aria-live="polite"
            aria-label={`${form.vibeScore} out of 10`}
          >
            {form.vibeScore}
            <span className="text-white/30 text-sm font-normal">/10</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={form.vibeScore}
          onChange={(e) => onChange({ vibeScore: Number(e.target.value) })}
          aria-labelledby="vibe-label"
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={form.vibeScore}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #00F5D4 0%, #00F5D4 ${(form.vibeScore - 1) / 9 * 100}%, rgba(255,255,255,0.1) ${(form.vibeScore - 1) / 9 * 100}%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-white/25 text-[10px]">1 — Dead</span>
          <span className="text-white/25 text-[10px]">10 — Insane</span>
        </div>
      </section>

      {/* Music type (optional) */}
      <section aria-labelledby="music-label">
        <p id="music-label" className="text-white/70 text-sm font-semibold mb-3">
          Music type <span className="text-white/30 font-normal text-xs">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="music-label">
          {MUSIC_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              value={opt.value}
              label={opt.label}
              selected={form.musicType === opt.value}
              onSelect={(v) => onChange({ musicType: form.musicType === v ? null : v })}
            />
          ))}
        </div>
      </section>

      {/* Wait time (optional) */}
      <section aria-labelledby="wait-label">
        <p id="wait-label" className="text-white/70 text-sm font-semibold mb-3">
          Wait time <span className="text-white/30 font-normal text-xs">(optional)</span>
        </p>
        <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="wait-label">
          {WAIT_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              value={opt.value}
              label={opt.label}
              selected={form.waitTime === opt.value}
              onSelect={(v) => onChange({ waitTime: form.waitTime === v ? null : v })}
            />
          ))}
        </div>
      </section>

      {/* Submit */}
      <button
        type="button"
        disabled={!form.crowdLevel || submitting}
        onClick={onSubmit}
        className="w-full min-h-[52px] rounded-xl font-black text-[#0A0A0F] text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
        style={{
          background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)",
          boxShadow: form.crowdLevel && !submitting ? "0 0 28px rgba(0,245,212,0.5), 0 0 56px rgba(0,245,212,0.15)" : undefined,
        }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-[#0A0A0F]/40 border-t-[#0A0A0F] animate-spin" />
            Logging vibe…
          </span>
        ) : (
          "Submit Check-in"
        )}
      </button>

      {!form.crowdLevel && (
        <p className="text-center text-white/30 text-xs" aria-live="polite">
          Select a crowd level to continue
        </p>
      )}
    </div>
  );
}

// --------------- Confirmation screen (Step 3) ---------------

function ConfirmationScreen({
  venueName,
  form,
  onViewVenue,
  onCheckInAgain,
}: {
  venueName: string;
  form: CheckInForm;
  onViewVenue: () => void;
  onCheckInAgain: () => void;
}) {
  const crowdOpt = CROWD_OPTIONS.find((o) => o.value === form.crowdLevel);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-[#00F5D4]/20 p-8 flex flex-col items-center gap-5 text-center"
        style={{
          background: "linear-gradient(145deg, rgba(0,245,212,0.06), rgba(255,255,255,0.03) 60%, rgba(168,85,247,0.05))",
          boxShadow: "0 0 48px rgba(0,245,212,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Check mark */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ background: "rgba(0,245,212,0.15)", boxShadow: "0 0 24px rgba(0,245,212,0.35)" }}
          aria-hidden="true"
        >
          ✓
        </div>

        <div className="space-y-1">
          <h2 className="text-white font-black text-2xl" style={{ textShadow: "0 0 24px rgba(0,245,212,0.25)" }}>
            Vibe Logged!
          </h2>
          <p className="text-white/60 text-sm">Thanks for reporting the vibe</p>
        </div>

        {/* Summary pill */}
        <div className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 space-y-1">
          <p className="text-white font-semibold text-sm truncate">{venueName}</p>
          <div className="flex items-center justify-center gap-3">
            {crowdOpt && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: crowdOpt.bg, color: crowdOpt.color, boxShadow: crowdOpt.glow }}
              >
                {crowdOpt.label}
              </span>
            )}
            <span className="text-[#00F5D4] font-bold text-sm">{form.vibeScore}/10</span>
          </div>
        </div>

        {/* Actions */}
        <div className="w-full grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onViewVenue}
            className="min-h-[44px] rounded-xl text-sm font-semibold text-white/80 bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] hover:text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            View venue
          </button>
          <button
            type="button"
            onClick={onCheckInAgain}
            className="min-h-[44px] rounded-xl text-sm font-bold text-[#0A0A0F] transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80"
            style={{
              background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)",
              boxShadow: "0 0 16px rgba(0,245,212,0.4)",
            }}
          >
            Check in again
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------- Error state --------------------------------

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-rose-950/50 border border-rose-500/30 p-8 flex flex-col items-center gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/15 flex items-center justify-center">
          <span className="text-3xl" aria-hidden="true">⚠️</span>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-rose-200 font-bold text-lg">Something went wrong</h2>
          <p className="text-rose-400/70 text-sm leading-relaxed">
            We couldn&apos;t submit your check-in. Please try again.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// --------------- Inner page component -----------------------

function CheckInInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefillVenueId = searchParams.get("venueId") ?? undefined;
  const prefillVenueName = searchParams.get("venueName") ?? "";

  // Step: "venue" | "form" | "done" | "error"
  const [step, setStep] = useState<"venue" | "form" | "done" | "error">(
    prefillVenueName ? "form" : "venue"
  );
  const [venueName, setVenueName] = useState(prefillVenueName);
  const [form, setForm] = useState<CheckInForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const handleFormChange = useCallback((patch: Partial<CheckInForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.crowdLevel) return;
    setSubmitting(true);
    try {
      // Optimistic: show confirmation immediately.
      // POST /api/check-ins will be wired once NV-042 lands.
      // Fire-and-forget background AI analysis via /api/vibe-check.
      void fetch("/api/vibe-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueName: venueName.trim(),
          ...(prefillVenueId ? { venueId: prefillVenueId } : {}),
          description: `Crowd: ${form.crowdLevel}. Vibe: ${form.vibeScore}/10.${form.musicType ? ` Music: ${form.musicType}.` : ""}${form.waitTime ? ` Wait: ${form.waitTime}.` : ""}`,
        }),
      }).catch(() => {/* background — ignore errors */});

      // Optimistic submit to check-ins route (NV-042 may not exist yet)
      try {
        const checkInResponse = await fetch("/api/check-ins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId: prefillVenueId ?? venueName.trim(),
            venueName: venueName.trim(),
            crowdLevel: form.crowdLevel,
            vibeScore: form.vibeScore,
            musicType: form.musicType,
            waitMinutes: waitTimeToMinutes(form.waitTime),
          }),
        });
        if (!checkInResponse.ok) throw new Error("Check-in submission failed");
      } catch {
        throw new Error("Check-in submission failed");
      }

      setStep("done");
    } catch {
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [form, venueName, prefillVenueId]);

  const handleCheckInAgain = () => {
    setForm({ ...EMPTY_FORM });
    setVenueName("");
    setStep("venue");
  };

  const handleViewVenue = () => {
    router.push("/");
  };

  const headerTitle =
    step === "done"
      ? "Vibe Logged!"
      : step === "form"
      ? venueName || "Report Vibe"
      : "Check In";

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/[0.08] relative overflow-hidden">
        {step === "done" && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
            style={{ background: "radial-gradient(ellipse 80% 200% at 50% -50%, rgba(0,245,212,0.12) 0%, transparent 70%)" }}
          />
        )}
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 flex-shrink-0"
          >
            <BackIcon />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className={`font-bold text-base leading-tight ${step === "done" ? "text-[#00F5D4]" : "text-white"}`}>
              {headerTitle}
            </h1>
            {step === "form" && (
              <p className="text-white/35 text-xs mt-0.5">
                {prefillVenueName ? "Pre-filled from search" : "Step 2 of 2"}
              </p>
            )}
          </div>
          {/* Step indicator */}
          {(step === "venue" || step === "form") && (
            <div className="flex gap-1.5 flex-shrink-0">
              <span className={`w-6 h-1.5 rounded-full transition-colors duration-200 ${step === "venue" ? "bg-[#00F5D4]" : "bg-[#00F5D4]/40"}`} />
              <span className={`w-6 h-1.5 rounded-full transition-colors duration-200 ${step === "form" ? "bg-[#00F5D4]" : "bg-white/15"}`} />
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {step === "venue" && (
          <VenueStep
            venueName={venueName}
            onChangeName={setVenueName}
            onContinue={() => setStep("form")}
          />
        )}
        {step === "form" && (
          <ReportForm
            venueName={venueName}
            form={form}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
        {step === "done" && (
          <ConfirmationScreen
            venueName={venueName}
            form={form}
            onViewVenue={handleViewVenue}
            onCheckInAgain={handleCheckInAgain}
          />
        )}
        {step === "error" && (
          <ErrorScreen onRetry={() => setStep("form")} />
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
