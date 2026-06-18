"use client";

// ============================================================
// Vibe Check Page
//
// Three-state flow:
//   "input"      → VibeCheckInput form
//   "processing" → VibeCheckProcessing loading screen
//   "result"     → VibeReport with the AI-generated report
//
// Query params accepted:
//   venueId    — optional, pre-fills venueId for the API call
//   venueName  — optional, pre-fills the venue name in the form
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VibeCheckInput } from "@/components/VibeCheckInput";
import { VibeCheckProcessing } from "@/components/VibeCheckProcessing";
import { VibeReport } from "@/components/VibeReport";
import type { VibeReport as VibeReportType } from "@/types";

type PageState = "input" | "processing" | "result";

// --------------- Back arrow --------------------------------

function BackButton() {
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="
        inline-flex items-center gap-1.5
        text-white/50 hover:text-white
        text-sm transition-colors duration-150
        focus:outline-none focus-visible:text-white
      "
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back
    </Link>
  );
}

// --------------- Error state --------------------------------

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-6 text-center space-y-4"
    >
      <div className="space-y-1">
        <p className="text-rose-300 font-semibold">Something went wrong</p>
        <p className="text-rose-400/70 text-sm">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="
          px-5 py-2.5 rounded-xl text-sm font-semibold text-white
          bg-gradient-to-r from-purple-600 to-pink-600
          hover:from-purple-500 hover:to-pink-500
          focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
          transition-all duration-150
        "
      >
        Try Again
      </button>
    </div>
  );
}

// --------------- Main page component -----------------------

export default function VibeCheckPage() {
  const searchParams = useSearchParams();
  const prefillVenueId = searchParams.get("venueId") ?? undefined;
  const prefillVenueName = searchParams.get("venueName") ?? "";

  const [pageState, setPageState] = useState<PageState>("input");
  const [currentVenueName, setCurrentVenueName] = useState(prefillVenueName);
  const [report, setReport] = useState<VibeReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(
    async (input: { venueName: string; description?: string; photoUrl?: string }) => {
      setCurrentVenueName(input.venueName);
      setError(null);
      setPageState("processing");

      try {
        const body = {
          venueName: input.venueName,
          description: input.description,
          photoUrl: input.photoUrl,
          // Pass the venueId from the query param if available
          ...(prefillVenueId ? { venueId: prefillVenueId } : {}),
        };

        const res = await fetch("/api/vibe-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          let detail = `Request failed (${res.status})`;
          try {
            const json = await res.json();
            if (json?.error?.message) detail = json.error.message;
          } catch {
            // ignore JSON parse error
          }
          throw new Error(detail);
        }

        const json = await res.json();
        // API wraps in { status, data } envelope
        const vibeReport: VibeReportType = json.data ?? json;

        setReport(vibeReport);
        setPageState("result");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
        setPageState("input");
      }
    },
    [prefillVenueId]
  );

  function handleRetry() {
    setError(null);
    setReport(null);
    setPageState("input");
  }

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  async function handleShare() {
    if (!report) return;
    const shareText = `Vibe check for ${report.venueName}: ${report.vibeScore}/10 — ${report.summary}`;
    const shareUrl = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${report.venueName} Vibe Report`, text: shareText, url: shareUrl });
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showToast("Copied to clipboard!");
    } catch {
      showToast("Could not copy to clipboard.");
    }
  }

  function handleSave() {
    showToast("Saved!");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            px-5 py-3 rounded-xl text-sm font-semibold text-white
            bg-white/10 backdrop-blur-lg border border-white/20
            shadow-lg pointer-events-none
            animate-pulse
          "
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/10 px-4">
        <div className="max-w-lg mx-auto py-4 flex items-center gap-3">
          <BackButton />
          <h1 className="text-white font-bold text-lg leading-none">
            {pageState === "result" ? "Vibe Report" : "Check a Vibe"}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Error banner shown above the form when in "input" state */}
        {error && pageState === "input" && (
          <ErrorView message={error} onRetry={handleRetry} />
        )}

        {pageState === "input" && !error && (
          <VibeCheckInput
            onSubmit={handleSubmit}
            isLoading={false}
            initialVenueName={prefillVenueName}
          />
        )}

        {pageState === "processing" && (
          <VibeCheckProcessing venueName={currentVenueName || "the venue"} />
        )}

        {pageState === "result" && (
          <>
            <VibeReport
              report={report ?? undefined}
              isLoading={false}
            />

            {/* Actions after report */}
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                aria-label="Share this vibe report"
                className="
                  flex-1 py-3 rounded-xl text-sm font-semibold text-white/70
                  bg-white/5 border border-white/10
                  hover:bg-white/10 hover:text-white
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
                  transition-all duration-150
                "
              >
                Share
              </button>
              <button
                onClick={handleSave}
                aria-label="Save this vibe report"
                className="
                  flex-1 py-3 rounded-xl text-sm font-semibold text-white/70
                  bg-white/5 border border-white/10
                  hover:bg-white/10 hover:text-white
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
                  transition-all duration-150
                "
              >
                Save
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="
                  flex-1 py-3 rounded-xl text-sm font-semibold text-white/70
                  bg-white/5 border border-white/10
                  hover:bg-white/10 hover:text-white
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
                  transition-all duration-150
                "
              >
                Check Another
              </button>
              <Link
                href="/"
                className="
                  flex-1 py-3 rounded-xl text-sm font-semibold text-white text-center
                  bg-gradient-to-r from-purple-600 to-pink-600
                  hover:from-purple-500 hover:to-pink-500
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
                  transition-all duration-150
                "
              >
                Back to Feed
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
