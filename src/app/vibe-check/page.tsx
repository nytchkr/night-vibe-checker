"use client";
import { useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VibeCheckInput } from "@/components/VibeCheckInput";
import { VibeCheckProcessing } from "@/components/VibeCheckProcessing";
import { VibeReport } from "@/components/VibeReport";
import { Toast } from "@/components/Toast";
import type { VibeReport as VibeReportType } from "@/types";
export const dynamic = "force-dynamic";

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function VibeCheckInner() {
  const searchParams = useSearchParams();
  const prefillVenueId = searchParams.get("venueId") ?? undefined;
  const prefillVenueName = searchParams.get("venueName") ?? "";

  const [pageState, setPageState] = useState<"input" | "processing" | "result" | "error">("input");
  const [currentVenueName, setCurrentVenueName] = useState(prefillVenueName);
  const [report, setReport] = useState<VibeReportType | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(async (input: { venueName: string; description?: string; photoBase64?: string }) => {
    setCurrentVenueName(input.venueName);
    setPageState("processing");
    try {
      const res = await fetch("/api/vibe-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...(prefillVenueId ? { venueId: prefillVenueId } : {}) }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setReport((await res.json()).data);
      setPageState("result");
    } catch {
      setPageState("error");
    }
  }, [prefillVenueId]);

  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Sticky header — back button + title */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/[0.08] relative overflow-hidden">
        {pageState === "processing" && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
            style={{
              background:
                "radial-gradient(ellipse 80% 200% at 50% -50%, rgba(0,245,212,0.15) 0%, transparent 70%)",
              animation: "vibeOuterPulse 2.4s ease-out infinite",
            }}
          />
        )}
        {pageState === "result" && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
            style={{
              background:
                "radial-gradient(ellipse 80% 200% at 20% -50%, rgba(0,245,212,0.1) 0%, transparent 70%), radial-gradient(ellipse 60% 150% at 80% -50%, rgba(255,45,120,0.08) 0%, transparent 70%)",
            }}
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
            <h1 className={`font-bold text-base leading-tight ${pageState === "processing" ? "text-[#00F5D4]" : "text-white"}`}>
              {pageState === "result" && report
                ? report.venueName
                : pageState === "processing"
                ? "Reading the vibe…"
                : "Check the Vibe"}
            </h1>
            {pageState === "input" && (
              <p className="text-white/35 text-xs mt-0.5">
                {prefillVenueName ? `Pre-filled from search` : "Enter any bar, club, or lounge"}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Page body */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {pageState === "input" && (
          <VibeCheckInput
            onSubmit={handleSubmit}
            isLoading={false}
            initialVenueName={prefillVenueName}
          />
        )}

        {pageState === "processing" && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <VibeCheckProcessing venueName={currentVenueName} />
          </div>
        )}

        {pageState === "result" && report && (
          <VibeReport
            report={report}
            isLoading={false}
            onShareCopied={() => showToast("Copied to clipboard!")}
          />
        )}

        {pageState === "error" && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl bg-rose-950/50 border border-rose-500/30 p-8 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500/15 flex items-center justify-center">
                <span className="text-3xl" aria-hidden="true">⚠️</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-rose-200 font-bold text-lg">Something went wrong</h2>
                <p className="text-rose-400/70 text-sm leading-relaxed">
                  We couldn&apos;t analyze that venue. Check the name and try again.
                </p>
              </div>
              <button
                onClick={() => setPageState("input")}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VibeCheckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}>
      <VibeCheckInner />
    </Suspense>
  );
}
