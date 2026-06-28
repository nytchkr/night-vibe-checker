"use client";

import { useEffect, useMemo, useState } from "react";

type ForecastHour = {
  hour: number;
  busyness: number;
};

type ForecastState = "loading" | "ready" | "empty";

export function BusynessForecast({ venueId }: { venueId: string }) {
  const [hours, setHours] = useState<ForecastHour[]>([]);
  const [state, setState] = useState<ForecastState>("loading");
  const currentHour = useMemo(() => new Date().getHours(), []);

  useEffect(() => {
    if (!venueId) {
      setHours([]);
      setState("empty");
      return;
    }

    const controller = new AbortController();
    setState("loading");

    async function loadForecast() {
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(venueId)}/forecast`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        const nextHours = Array.isArray(json?.hours) ? json.hours : [];
        if (!controller.signal.aborted) {
          setHours(nextHours);
          setState(nextHours.length ? "ready" : "empty");
        }
      } catch {
        if (!controller.signal.aborted) {
          setHours([]);
          setState("empty");
        }
      }
    }

    void loadForecast();
    return () => controller.abort();
  }, [venueId]);

  return (
    <section
      className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4"
      role="region"
      aria-label="Hourly busyness forecast"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white">Hourly forecast</h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
            BestTime estimate
          </p>
        </div>
        <span className="text-xs font-bold text-[#8B6CFF]">Today</span>
      </div>

      {state === "loading" ? (
        <div className="flex h-28 items-end gap-1.5" aria-label="Loading forecast">
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="min-h-2 flex-1 animate-pulse rounded-t bg-white/10"
              style={{ height: `${18 + ((hour % 6) * 10)}%` }}
            />
          ))}
        </div>
      ) : state === "empty" ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-4 text-sm font-semibold text-white/45">
          Forecast not available
        </p>
      ) : (
        <div className="flex h-28 items-end gap-1.5" aria-label="24-hour busyness forecast">
          {hours.slice(0, 24).map((item) => {
            const busyness = Math.max(0, Math.min(100, Math.round(item.busyness)));
            const isCurrent = item.hour === currentHour;
            const isPast = item.hour < currentHour;
            return (
              <div
                key={item.hour}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${item.hour}:00 - ${busyness}% busy`}
              >
                <div
                  className={`w-full rounded-t transition-colors ${
                    isCurrent ? "bg-[#8B6CFF]" : "bg-[#00F5D4]/80"
                  }`}
                  style={{
                    height: `${busyness}%`,
                    minHeight: busyness > 0 ? 6 : 2,
                    opacity: isPast && !isCurrent ? 0.3 : 1,
                  }}
                  aria-label={`Hour ${item.hour}: ${busyness}% busy${isCurrent ? " current hour" : ""}`}
                />
                {(item.hour === 0 || item.hour === 6 || item.hour === 12 || item.hour === 18 || isCurrent) && (
                  <span className={`text-[9px] font-bold ${isCurrent ? "text-[#8B6CFF]" : "text-white/30"}`}>
                    {item.hour}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
