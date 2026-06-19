"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { CrowdFeel, ReportedBusyness } from "@/types";

export const dynamic = "force-dynamic";

const BUSYNESS_OPTIONS: { value: ReportedBusyness; label: string }[] = [
  { value: "dead", label: "Dead" },
  { value: "moderate", label: "Moderate" },
  { value: "packed", label: "Packed" },
];

const CROWD_OPTIONS: { value: CrowdFeel; label: string }[] = [
  { value: "mostly_male", label: "Mostly male" },
  { value: "mostly_female", label: "Mostly female" },
  { value: "balanced", label: "Balanced" },
  { value: "mixed", label: "Mixed / unsure" },
];

function OptionButton<T extends string>({
  value,
  label,
  selected,
  onSelect,
}: {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={`min-h-[52px] rounded-xl border text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 ${
        selected
          ? "border-[#00F5D4] bg-[#00F5D4]/20 text-[#00F5D4]"
          : "border-white/10 bg-white/[0.05] text-white/58 hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
}

function CheckInInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const venueId = searchParams.get("venueId") ?? "";
  const venueName = decodeURIComponent(searchParams.get("venueName") ?? "");

  const [busyness, setBusyness] = useState<ReportedBusyness | null>(null);
  const [crowdFeel, setCrowdFeel] = useState<CrowdFeel | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!venueId || !busyness || !crowdFeel || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const client = createBrowserClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Log in to report a vibe.");
        return;
      }

      const res = await fetch("/api/check-ins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          venueId,
          busyness,
          crowdFeel,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error?.message ?? "Could not submit report.");
        return;
      }

      setDone(true);
      setTimeout(() => router.push("/"), 1200);
    } catch {
      setError("Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  }, [busyness, crowdFeel, note, router, submitting, venueId]);

  const canSubmit = Boolean(venueId && busyness && crowdFeel && !submitting && !done);

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#00F5D4]/25 bg-white/[0.04] p-8 text-center">
          <h1 className="text-2xl font-black text-[#00F5D4]">Vibe logged</h1>
          <p className="mt-2 text-sm text-white/50">Updating the live read...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <Link href="/" className="text-sm font-semibold text-white/55 hover:text-white">Back</Link>
          <h1 className="truncate text-base font-bold text-white">{venueName || "Report vibe"}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-32">
        {!venueId && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-200">
            Choose a cached venue from the feed before reporting.
          </div>
        )}

        <section>
          <p className="mb-3 text-sm font-semibold text-white/72">How busy is it?</p>
          <div className="grid grid-cols-3 gap-2">
            {BUSYNESS_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                value={option.value}
                label={option.label}
                selected={busyness === option.value}
                onSelect={setBusyness}
              />
            ))}
          </div>
        </section>

        <section>
          <p className="mb-3 text-sm font-semibold text-white/72">Crowd feel</p>
          <div className="grid grid-cols-2 gap-2">
            {CROWD_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                value={option.value}
                label={option.label}
                selected={crowdFeel === option.value}
                onSelect={setCrowdFeel}
              />
            ))}
          </div>
        </section>

        <section>
          <label htmlFor="note" className="mb-2 block text-sm font-semibold text-white/72">
            Note <span className="font-normal text-white/35">(optional)</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#00F5D4]/60 focus:outline-none"
            placeholder="Line, cover, music, anything useful..."
          />
        </section>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="min-h-[52px] w-full rounded-xl bg-[#00F5D4] text-base font-black text-[#0A0A0F] transition-all disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting..." : "Submit report"}
        </button>

        {error && <p role="alert" className="text-center text-sm text-rose-400">{error}</p>}
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
