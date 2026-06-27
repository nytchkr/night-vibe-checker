"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  Info,
  Lock,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PredictionSkeleton } from "@/components/PredictionSkeleton";
import type { PredictionResponse } from "@/types/prediction";

type VenuePredictionCardProps = {
  venueId: string;
  checkInCount?: number;
  hasBestTimeVenue?: boolean;
  hourlyForecast?: Array<{ hour: number; busyness: number }>;
  hourlyLoading?: boolean;
  hourlyUpdatedOn?: string | null;
};

type PredictionState =
  | { status: "loading" }
  | { status: "ready"; response: PredictionResponse }
  | { status: "empty"; reason?: "no_data" | "forecast_unavailable" };

type LockedChipConfig = {
  title: string;
  body: string;
  source: string;
  Icon: LucideIcon;
};

const EMPTY_COPY = "Not enough reports yet — be the first to check in";
const PRO_COPY = "More real-data forecasts planned for Pro. No invented crowd data.";

function reportLabel(count: number): string {
  return `${count} check-in ${count === 1 ? "report" : "reports"}`;
}

function compactReportLabel(count: number): string {
  return `${count} ${count === 1 ? "report" : "reports"}`;
}

function chipSource(hasBestTimeData: boolean, count: number): string {
  if (hasBestTimeData && count === 0) return "BestTime only";
  if (hasBestTimeData) return `BestTime + ${compactReportLabel(count)}`;
  return compactReportLabel(count);
}

function forecastSourceLabel(hasBestTimeData: boolean, count: number): string {
  if (hasBestTimeData) {
    return `AI forecast — based on BestTime data + ${reportLabel(count)}`;
  }
  return `AI forecast — based on ${reportLabel(count)}`;
}

function footerAttribution(hasBestTimeData: boolean, count: number): string {
  if (hasBestTimeData) return `Powered by BestTime + ${compactReportLabel(count)}`;
  return `Based on ${reportLabel(count)}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function busynessColor(percent: number): string {
  if (percent >= 67) return "#FF5B6A";
  if (percent >= 34) return "#FFB020";
  return "#00F5D4";
}

function isPredictionResponse(value: unknown): value is PredictionResponse {
  const candidate = value as Partial<PredictionResponse> | null;
  return candidate?.status === "success" && typeof candidate.data?.venueId === "string";
}

function hasUnavailableFlag(value: unknown): boolean {
  return (value as { available?: unknown } | null)?.available === false;
}

function bestTimeTitle(response: PredictionResponse): string {
  const bestTime = response.data.predictions.bestTimeToVisit;
  if (!bestTime) return "Best time to visit";
  const window = bestTime.hourWindow.trim();
  if (!window || window.toLowerCase() === "unknown") return "Best time to visit";
  return `Best tonight: ${window}`;
}

function getLockedChips(count: number, hasBestTimeData: boolean): LockedChipConfig[] {
  const crowdSource = count >= 3 ? compactReportLabel(count) : "Needs 3 reports";
  return [
    {
      title: "Full crowd forecast",
      body: "Hourly crowd windows",
      source: hasBestTimeData ? "BestTime data" : "Needs BestTime data",
      Icon: Clock3,
    },
    {
      title: "Vibe trend",
      body: "Up or down vs. typical",
      source: count > 0 ? `${compactReportLabel(count)} recent` : "Needs reports",
      Icon: count >= 3 ? TrendingUp : TrendingDown,
    },
    {
      title: "Crowd profile",
      body: "Predicted M/F mix",
      source: crowdSource,
      Icon: Users,
    },
  ];
}

function LockedPredictionChip({ title, body, source, Icon }: LockedChipConfig) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[#8B6CFF]">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
            <h3 className="text-sm font-black text-white/80">{title}</h3>
          </div>
          <p className="mt-1 text-xs font-semibold text-white/45">{body}</p>
          <p className="mt-2 text-[11px] font-semibold text-white/35">{source}</p>
          <p className="mt-1 text-[11px] font-black text-[#8B6CFF]">Unlock later</p>
        </div>
      </div>
    </div>
  );
}

export function VenuePredictionCard({
  venueId,
  checkInCount,
  hasBestTimeVenue,
  hourlyForecast = [],
  hourlyLoading = false,
  hourlyUpdatedOn,
}: VenuePredictionCardProps) {
  const [state, setState] = useState<PredictionState>({ status: "loading" });

  const loadPrediction = useCallback(async (signal?: AbortSignal) => {
    if (!venueId) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/venues/${encodeURIComponent(venueId)}/predict`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok || hasUnavailableFlag(json) || !isPredictionResponse(json)) {
        throw new Error("Prediction unavailable");
      }
      if (!json.data.predictions.bestTimeToVisit) {
        setState({ status: "empty", reason: json.data.dataQuality.hasBestTimeData ? "no_data" : "forecast_unavailable" });
        return;
      }
      setState({ status: "ready", response: json });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "empty", reason: "forecast_unavailable" });
    }
  }, [venueId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPrediction(controller.signal);
    return () => controller.abort();
  }, [loadPrediction]);

  useEffect(() => {
    function handleCheckInCreated(event: Event) {
      const detail = (event as CustomEvent<{ venueId?: string }>).detail;
      if (detail?.venueId && detail.venueId !== venueId) return;
      void loadPrediction();
    }

    window.addEventListener("nightvibe:check-in-created", handleCheckInCreated);
    return () => window.removeEventListener("nightvibe:check-in-created", handleCheckInCreated);
  }, [loadPrediction, venueId]);

  if (state.status === "loading") return <PredictionSkeleton />;

  if (state.status === "empty") {
    const emptyCopy = state.reason === "forecast_unavailable"
      ? "Not enough reports yet - forecast unavailable"
      : EMPTY_COPY;
    return (
      <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4" aria-label="AI forecast">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8B6CFF]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          AI forecast
        </div>
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0A0A0E] p-4">
          <p className="text-sm font-black text-white">{emptyCopy}</p>
        </div>
      </section>
    );
  }

  const response = state.response;
  const count = response.data.dataQuality.checkInCount;
  const hasBestTimeData = response.data.dataQuality.hasBestTimeData;
  const bestTime = response.data.predictions.bestTimeToVisit;
  const bestTimeBasis = bestTime?.basis?.trim();
  const qualityLabel = chipSource(hasBestTimeData, count);
  const lockedChips = getLockedChips(count, hasBestTimeData || Boolean(hasBestTimeVenue));

  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4" aria-label="AI forecast">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8B6CFF]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI forecast
      </div>

      <div className="mt-2">
        <h2 className="font-display text-lg font-semibold text-[#F4F5F8]">Best time tonight</h2>
        <p className="mt-1 text-xs font-semibold text-white/45">
          {forecastSourceLabel(hasBestTimeData, count)}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-[#8B6CFF]/45 bg-[#8B6CFF]/10 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF]">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8B6CFF]">
                Best time to visit
              </p>
              <h3 className="mt-1 text-base font-black text-white">{bestTimeTitle(response)}</h3>
              <p className="mt-1 text-sm font-medium leading-5 text-white/65">
                {bestTimeBasis || "Based on BestTime peak and recent crowd feel."}
              </p>
              <p className="mt-2 text-[11px] font-semibold text-white/45">{qualityLabel}</p>
            </div>
          </div>
        </div>

        {(hourlyLoading || hourlyForecast.length > 0) && (
          <div className="rounded-2xl border border-white/10 bg-[#0A0A0E] p-4" aria-label="Next 6 hours">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white">Next 6 hours</h3>
                <p className="mt-1 text-xs font-semibold text-white/40">BestTime hourly forecast</p>
              </div>
              {hourlyUpdatedOn ? (
                <p className="shrink-0 text-[11px] font-semibold text-white/30">Updated</p>
              ) : null}
            </div>

            {hourlyLoading ? (
              <div className="mt-4 grid grid-cols-6 gap-2" role="status" aria-label="Loading hourly forecast">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-xl bg-white/[0.06]" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-6 gap-2">
                {hourlyForecast.slice(0, 6).map((item) => {
                  const busyness = clampPercent(item.busyness);
                  const color = busynessColor(busyness);
                  return (
                    <div key={item.hour} className="min-w-0 rounded-xl bg-white/[0.045] px-2 py-3 text-center">
                      <p className="truncate text-[11px] font-black text-white/50">{formatHourLabel(item.hour)}</p>
                      <div className="mx-auto mt-3 flex h-14 w-2 items-end rounded-full bg-white/10" aria-hidden="true">
                        <div
                          className="w-full rounded-full"
                          style={{ height: `${Math.max(8, busyness)}%`, backgroundColor: color }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] font-black" style={{ color }}>
                        {busyness}%
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {lockedChips.map((chip) => (
            <LockedPredictionChip key={chip.title} {...chip} />
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-white/[0.08] pt-3">
        <p className="flex items-start gap-2 text-[11px] font-semibold leading-4 text-white/40">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F0568C]" aria-hidden="true" />
          <span>{PRO_COPY}</span>
        </p>
        <p className="text-[11px] font-semibold text-white/35">
          {footerAttribution(hasBestTimeData, count)}
        </p>
      </div>
    </section>
  );
}

export default VenuePredictionCard;
