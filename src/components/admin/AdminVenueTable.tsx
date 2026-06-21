"use client";

import { useState } from "react";
import type { AdminVenue } from "@/types/admin";

interface Props {
  initialVenues: AdminVenue[];
  token: string;
}

function formatRefreshTime(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminVenueTable({ initialVenues, token }: Props) {
  const [venues, setVenues] = useState<AdminVenue[]>(initialVenues);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  function updateVenue(updated: AdminVenue) {
    setVenues((prev) => prev.map((venue) => (venue.id === updated.id ? updated : venue)));
  }

  async function toggleVenue(venue: AdminVenue) {
    const next = { ...venue, hidden: !venue.hidden };
    setBusyId(venue.id);
    updateVenue(next);

    try {
      const res = await fetch(`/api/admin/venues/${venue.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hidden: next.hidden }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      const json = (await res.json()) as { venue: AdminVenue };
      updateVenue(json.venue);
    } catch {
      updateVenue(venue);
      alert("Venue update failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function refreshVenue(venue: AdminVenue) {
    setRefreshingId(venue.id);
    try {
      const res = await fetch(`/api/jobs/refresh-busyness?venueId=${encodeURIComponent(venue.id)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Refresh failed");
      const refreshedAt = new Date().toISOString();
      updateVenue({ ...venue, lastBusynessRefresh: refreshedAt });
    } catch {
      alert("Refresh failed. Check BestTime configuration and try again.");
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-base font-semibold text-white">Venues</h2>
        <p className="mt-1 text-sm text-white/40">Hide venues from public discovery or refresh one venue signal.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-white/[0.08]">
              {["Venue", "Category", "Busyness", "Reads", "Last Refresh", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/35"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {venues.map((venue) => (
              <tr
                key={venue.id}
                className={`border-b border-white/[0.06] transition-colors hover:bg-white/[0.02] ${
                  venue.hidden ? "bg-white/[0.015] text-white/35" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className={`text-sm font-semibold ${venue.hidden ? "text-white/35 line-through" : "text-white/80"}`}>
                    {venue.name}
                  </div>
                  <div className="max-w-[240px] truncate text-xs text-white/30">{venue.address}</div>
                </td>
                <td className="px-3 py-2.5 text-sm text-white/50">{venue.category.replace("_", " ")}</td>
                <td className="px-3 py-2.5 text-sm text-white/60">
                  {venue.busyness0To100 == null ? "No signal" : `${venue.busyness0To100}/100`}
                </td>
                <td className="px-3 py-2.5 text-sm text-white/50">{venue.sampleSize}</td>
                <td className="px-3 py-2.5 text-sm text-white/40 whitespace-nowrap">
                  {formatRefreshTime(venue.lastBusynessRefresh)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleVenue(venue)}
                      disabled={busyId === venue.id}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-40"
                    >
                      {venue.hidden ? "Unhide venue" : "Hide venue"}
                    </button>
                    <button
                      onClick={() => refreshVenue(venue)}
                      disabled={refreshingId === venue.id}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#8B6CFF]/20 text-[#8B6CFF] hover:bg-[#8B6CFF]/10 hover:border-[#8B6CFF]/40 transition-all disabled:opacity-40"
                    >
                      {refreshingId === venue.id ? "Refreshing" : "Refresh signal"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
