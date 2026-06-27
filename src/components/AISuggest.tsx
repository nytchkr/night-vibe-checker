"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VenuePhoto } from "@/components/VenuePhoto";
import type { AISuggestMode, AISuggestPick, AISuggestResult } from "@/lib/aiSuggest";
import type { APIResponse } from "@/types";

type AISuggestProps = {
  userLat?: number | null;
  userLng?: number | null;
  className?: string;
};

type RequestState = "idle" | "loading" | "success" | "error";

function venueHref(pick: AISuggestPick): string {
  return `/venues/${encodeURIComponent(pick.venue.slug || pick.venue.id)}`;
}

function modeLabel(mode: AISuggestMode): string {
  return mode === "surprise" ? "Surprise me" : "Help me decide";
}

function modeIcon(mode: AISuggestMode) {
  return mode === "surprise" ? <Sparkles aria-hidden="true" /> : <ListChecks aria-hidden="true" />;
}

export function AISuggest({ userLat = null, userLng = null, className = "" }: AISuggestProps) {
  const [mode, setMode] = useState<AISuggestMode>("surprise");
  const [intent, setIntent] = useState("");
  const [status, setStatus] = useState<RequestState>("idle");
  const [result, setResult] = useState<AISuggestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shownVenueIds, setShownVenueIds] = useState<string[]>([]);

  const fallbackLabel = useMemo(() => {
    if (result?.aiStatus === "unavailable") return "AI unavailable - showing best cached picks";
    if (!result?.filterFallbackReason) return null;
    return "Showing nearby options";
  }, [result?.aiStatus, result?.filterFallbackReason]);

  async function runSuggest(nextMode: AISuggestMode, spinAgain = false) {
    setStatus("loading");
    setError(null);

    const excludeVenueIds = nextMode === "surprise"
      ? Array.from(new Set([
          ...shownVenueIds,
          ...(spinAgain ? result?.picks.map((pick) => pick.venue.id) ?? [] : []),
        ]))
      : [];
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: nextMode,
          intent,
          userLat,
          userLng,
          excludeVenueIds,
        }),
      });
      const json = (await res.json()) as APIResponse<AISuggestResult>;
      if (!res.ok || json.status !== "success" || !json.data) {
        throw new Error(json.error?.message ?? "Could not load suggestions.");
      }

      setResult(json.data);
      if (nextMode === "surprise") {
        setShownVenueIds((current) => {
          const next = new Set(current);
          for (const pick of json.data?.picks ?? []) next.add(pick.venue.id);
          return Array.from(next);
        });
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suggestions.");
      setStatus("error");
    }
  }

  function switchMode(nextMode: AISuggestMode) {
    setMode(nextMode);
    setResult(null);
    setError(null);
    setStatus("idle");
  }

  return (
    <section className={`space-y-4 ${className}`} aria-label="AI venue suggestions">
      <Card className="border-white/[0.06] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10">
        <CardHeader className="space-y-3 p-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base tracking-tight text-[#F4F5F8]">
              <Sparkles className="h-4 w-4 text-[#00F5D4]" aria-hidden="true" />
              Let AI choose
            </CardTitle>
            <span className="rounded-full border border-[#00F5D4]/30 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#00F5D4]">
              Real data only
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Suggestion mode">
            {(["surprise", "decide"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                variant="ghost"
                aria-pressed={mode === item}
                onClick={() => switchMode(item)}
                className={`min-h-11 rounded-full border text-sm transition-all duration-200 ease-out active:scale-95 ${
                  mode === item
                    ? "border-[#8B6CFF] bg-[#8B6CFF] text-[#0A0A0E] shadow-[0_0_22px_rgba(139,108,255,0.3)]"
                    : "border-white/[0.06] bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:ring-1 hover:ring-violet/20"
                }`}
              >
                {modeIcon(item)}
                {modeLabel(item)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <Input
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="Close, not too packed, budget friendly"
            aria-label="What kind of venue do you want?"
            className="min-h-11 border-white/[0.06] bg-white/[0.05] font-medium text-white transition-all duration-200 ease-out placeholder:text-[#9CA2AE] focus:border-violet/60 focus:ring-violet/40"
          />
          <Button
            type="button"
            onClick={() => runSuggest(mode)}
            disabled={status === "loading"}
            className="min-h-11 w-full rounded-full bg-[#8B6CFF] font-semibold text-[#0A0A0E] shadow-[0_0_22px_rgba(139,108,255,0.28)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#9C85FF] hover:shadow-violet/30 active:scale-95"
          >
            {status === "loading" ? "Checking..." : modeLabel(mode)}
          </Button>
          {fallbackLabel ? <p className="text-xs text-white/55">{fallbackLabel}</p> : null}
          {error ? (
            <div className="rounded-2xl border border-[#F0568C]/30 bg-[#F0568C]/10 p-3">
              <p className="text-sm text-[#FFC0D4]">{error}</p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => runSuggest(mode)}
                className="mt-3 min-h-10 rounded-full bg-white/[0.06] px-4 text-white transition-all duration-200 ease-out hover:bg-white/[0.1] active:scale-95"
              >
                Retry
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result?.picks.length ? (
        <div className="space-y-3">
          {result.picks.map((pick) => (
            <Card key={pick.venue.id} className="border-white/[0.06] bg-white/[0.04] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10">
              <CardContent className="space-y-3 p-4">
                <VenuePhoto
                  name={pick.venue.name}
                  photoUrl={pick.venue.photoUrl ?? pick.venue.photoUrls?.[0]}
                  className="-mx-1 h-28 rounded-[14px] border border-white/[0.06]"
                  sizes="(max-width: 640px) calc(100vw - 2.5rem), 420px"
                  loading="lazy"
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold tracking-tight text-[#F4F5F8]">{pick.venue.name}</p>
                    <p className="mt-1 text-xs text-white/55">{pick.venue.category}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#00F5D4]/10 px-2 py-1 text-[11px] font-semibold text-[#00F5D4]">
                    {result.aiStatus === "unavailable" ? "AI unavailable" : "Suggested"}
                  </span>
                </div>
                <p className="text-sm leading-6 text-white/75">{pick.explanation}</p>
                <details className="rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-sm text-white/70">
                  <summary className="cursor-pointer text-sm font-semibold text-white">Why this pick?</summary>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/55">
                    <div><dt className="text-white/40">Category</dt><dd>{pick.facts.category ?? "Unknown"}</dd></div>
                    <div><dt className="text-white/40">Rating</dt><dd>{pick.facts.rating?.toFixed(1) ?? "No rating"}</dd></div>
                    <div><dt className="text-white/40">Distance</dt><dd>{pick.facts.distanceKm == null ? "Nearby" : `${pick.facts.distanceKm.toFixed(1)} km`}</dd></div>
                    <div><dt className="text-white/40">Crowd source</dt><dd>{pick.facts.busynessSource ?? "No live source"}</dd></div>
                  </dl>
                </details>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="ghost" className="h-10 rounded-full bg-white/[0.06] px-4 text-white transition-all duration-200 ease-out hover:bg-white/[0.1] active:scale-95">
                    <Link href={venueHref(pick)}>View venue</Link>
                  </Button>
                  {mode === "surprise" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => runSuggest("surprise", true)}
                      disabled={status === "loading"}
                      className="h-10 rounded-full bg-white/[0.06] px-4 text-white transition-all duration-200 ease-out hover:bg-white/[0.1] active:scale-95"
                    >
                      <RotateCcw aria-hidden="true" />
                      Spin again
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}
