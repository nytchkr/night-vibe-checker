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
  const [pageState, setPageState] = useState<"input"|"processing"|"result">("input");
  const [currentVenueName, setCurrentVenueName] = useState(prefillVenueName);
  const [report, setReport] = useState<VibeReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSubmit = useCallback(async (input: { venueName: string; description?: string; photoUrl?: string }) => {
    setCurrentVenueName(input.venueName); setError(null); setPageState("processing");
    try {
      const res = await fetch("/api/vibe-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...(prefillVenueId ? { venueId: prefillVenueId } : {}) }) });
      if (!res.ok) throw new Error(`${res.status}`);
      setReport((await res.json()).data); setPageState("result");
    } catch (e) { setError(String(e)); setPageState("input"); }
  }, [prefillVenueId]);
  const showToast = (m: string) => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(m); toastTimerRef.current = setTimeout(() => setToast(null), 2500); };
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {pageState === "input" && <VibeCheckInput onSubmit={handleSubmit} isLoading={false} initialVenueName={prefillVenueName} />}
      {pageState === "processing" && <VibeCheckProcessing venueName={currentVenueName} />}
      {pageState === "result" && report && <VibeReport report={report} isLoading={false} />}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
export default function VibeCheckPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#0A0A0F]" />}><VibeCheckInner /></Suspense>;
}
