"use client";

import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type TonightStatsResponse = {
  checkInsTonight?: number;
  venuesActive?: number;
};

type TonightStatsState = {
  checkInsTonight: number;
  venuesActive: number;
};

export default function TonightStats() {
  const [stats, setStats] = useState<TonightStatsState | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const response = await fetch("/api/stats/tonight", {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          if (isMounted) setStats(null);
          return;
        }

        const data = (await response.json()) as TonightStatsResponse;
        const checkInsTonight = Number(data.checkInsTonight ?? 0);
        const venuesActive = Number(data.venuesActive ?? 0);

        if (isMounted) {
          setStats({
            checkInsTonight: Number.isFinite(checkInsTonight) ? checkInsTonight : 0,
            venuesActive: Number.isFinite(venuesActive) ? venuesActive : 0,
          });
        }
      } catch {
        if (isMounted) setStats(null);
      }
    }

    loadStats();
    const intervalId = window.setInterval(loadStats, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!stats || stats.checkInsTonight < 1) return null;

  return (
    <div className="fixed left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#8B6CFF]/30 bg-[#1A1A2E]/80 px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-black/20 backdrop-blur">
      🔥 {stats.checkInsTonight} check-ins tonight across {stats.venuesActive} spots
    </div>
  );
}
