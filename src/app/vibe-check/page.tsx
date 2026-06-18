"use client";
import { useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VibeCheckInput } from "@/components/VibeCheckInput";
import { VibeCheckProcessing } from "@/components/VibeCheckProcessing";
import { VibeReport } from "@/components/VibeReport";
import { Toast } from "@/components/Toast";
import type { VibeReport as VibeReportType } from "@/types";
export const dynamic = "force-dynamic";

function VibeCheckInner() {
  const searchParams = useSearchParams();
  const prefillVenueId = searchParams.get("venueId") ?? undefined;
  const prefillVenueName = searchParams.get("venueName") ?? "";
  const [pageState, setPageState] = useState<"input"|"processing"|"result"|"error">("input");
  const [currentVenueName, setCurrentVenueName] = useState(prefillVenueName);
  const [report, setReport] = useState<VibeReportType | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSubmit = useCallback(async (input: { venueName: string; description?: string; photoBase64?: string }) => {
    setCurrentVenueName(input.venueName); setPageState("processing");
    try {
      const res = await fetch("/api/vibe-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...(prefillVenueId ? { venueId: prefillVenueId } : {}) }) });
      if (!res.ok) throw new Error(`${res.status}`);
      setReport((await res.json()).data); setPageState("result");
    } catch { setPageState("error"); }
  }, [prefillVenueId]);
  const showToast = (m: string) => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(m); toastTimerRef.current = setTimeout(() => setToast(null), 2500); };
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {pageState === "input" && <VibeCheckInput onSubmit={handleSubmit} isLoading={false} initialVenueName={prefillVenueName} />}
      {pageState === "processing" && <VibeCheckProcessing venueName={currentVenueName} />}
      {pageState === "result" && report && <VibeReport report={report} isLoading={false} onShareCopied={() => showToast("Copied to clipboard!")} />}
      {pageState === "error" && (
        <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
          <div className="max-w-sm w-full rounded-2xl bg-rose-950/60 border border-rose-500/40 p-8 flex flex-col items-center gap-4 text-center">
            <span className="text-4xl" aria-hidden="true">⚠️</span>
            <h2 className="text-rose-300 font-bold text-lg">Something went wrong</h2>
            <p className="text-rose-400/70 text-sm">We couldn&apos;t analyze that venue. Please try again.</p>
            <button
              onClick={() => setPageState("input")}
              className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default function VibeCheckPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}><VibeCheckInner /></Suspense>;
}
