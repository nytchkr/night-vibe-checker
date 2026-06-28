"use client";

import { useEffect, useState } from "react";

type ForecastHour = {
  hour: number;
  busyness: number;
};

type ForecastDay = {
  dayInt: number | null;
  hours: ForecastHour[];
  updatedOn: string | null;
};

type ForecastState =
  | { status: "loading" }
  | { status: "ready"; days: ForecastDay[] }
  | { status: "empty" };

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function peakForDay(day: ForecastDay): { hour: number; busyness: number } | null {
  const validHours = day.hours.filter((hour) => Number.isInteger(hour.hour) && Number.isFinite(hour.busyness));
  if (!validHours.length) return null;
  return validHours.reduce((best, hour) => (hour.busyness > best.busyness ? hour : best), validHours[0]);
}

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

export function BestTimeWeekForecast({ venueId }: { venueId: string }) {
  const [state, setState] = useState<ForecastState>({ status: "loading" });

  useEffect(() => {
    if (!venueId) {
      setState({ status: "empty" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    async function loadForecast() {
      const res = await fetch(`/api/venues/${encodeURIComponent(venueId)}/besttime-forecast`, {
        cache: "no-store",
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);

      const json = await res.json();
      const days = Array.isArray(json?.data?.days) ? json.data.days : [];
      if (!controller.signal.aborted) {
        setState(days.length ? { status: "ready", days } : { status: "empty" });
      }
    }

    void loadForecast().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!controller.signal.aborted) setState({ status: "empty" });
    });

    return () => controller.abort();
  }, [venueId]);

  return (
    <section className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-4" aria-label="Full-week forecast">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#00F5D4]">Pro forecast</p>
          <h2 className="mt-1 font-display text-xl font-black text-white">Full-week forecast</h2>
        </div>
        <span className="rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 px-3 py-1 text-xs font-black text-[#8B6CFF]">
          7 days
        </span>
      </div>

      {state.status === "loading" ? (
        <div className="mt-5 grid grid-cols-7 gap-2" role="status" aria-label="Loading full-week forecast">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      ) : state.status === "empty" ? (
        <p className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-4 text-sm font-semibold text-white/45">
          Full-week forecast not available
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-7 gap-2">
          {state.days.slice(0, 7).map((day, index) => {
            const peak = peakForDay(day);
            const busyness = peak ? clampPercent(peak.busyness) : 0;
            const label = typeof day.dayInt === "number" ? DAY_LABELS[day.dayInt] ?? DAY_LABELS[index] : DAY_LABELS[index];
            const barColor = busyness >= 67 ? "#FF5B6A" : busyness >= 50 ? "#FFB020" : "#00F5D4";

            return (
              <div
                key={`${label}-${index}`}
                className="min-w-0 rounded-2xl border border-white/[0.07] bg-[#0A0A0E] px-2 py-3 text-center"
              >
                <p className="truncate text-[11px] font-black text-white/55">{label}</p>
                <div className="mx-auto mt-3 flex h-16 w-2 items-end rounded-full bg-white/10" aria-hidden="true">
                  <div
                    className="w-full rounded-full"
                    style={{ height: `${Math.max(8, busyness)}%`, backgroundColor: barColor }}
                  />
                </div>
                <p className="mt-2 text-[11px] font-black" style={{ color: barColor }}>
                  {busyness}%
                </p>
                <p className="mt-1 truncate text-[10px] font-semibold text-white/35">
                  {peak ? formatHour(peak.hour) : "No read"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
