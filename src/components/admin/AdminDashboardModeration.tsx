"use client";

import { useState } from "react";

export type DashboardVenue = {
  venueId: string;
  name: string;
  count: number;
  hidden?: boolean;
};

export type DashboardCheckIn = {
  id: string;
  venueId: string;
  userEmail: string;
  venueName: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function BusiestVenueRows({ initialVenues }: { initialVenues: DashboardVenue[] }) {
  const [venues, setVenues] = useState(initialVenues);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function hideVenue(venue: DashboardVenue) {
    setBusyId(venue.venueId);
    setVenues((current) =>
      current.map((item) => (item.venueId === venue.venueId ? { ...item, hidden: true } : item))
    );

    try {
      const response = await fetch(`/api/admin/venues/${venue.venueId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Hide failed");
    } catch {
      setVenues((current) =>
        current.map((item) => (item.venueId === venue.venueId ? { ...item, hidden: false } : item))
      );
      alert("Could not hide venue. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (venues.length === 0) {
    return (
      <tr>
        <td className="px-4 py-6 text-white/55" colSpan={3}>
          No check-ins in the last 24 hours.
        </td>
      </tr>
    );
  }

  return venues.map((venue) => (
    <tr
      key={venue.venueId}
      className={`border-b border-white/5 last:border-0 ${venue.hidden ? "opacity-45" : ""}`}
    >
      <td className={`px-4 py-3 text-white ${venue.hidden ? "line-through" : ""}`}>{venue.name}</td>
      <td className="px-4 py-3 text-right tabular-nums text-white/80">{venue.count}</td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => hideVenue(venue)}
          disabled={busyId === venue.venueId || venue.hidden}
          className="rounded-md border border-white/10 px-3 py-1 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {venue.hidden ? "Hidden" : busyId === venue.venueId ? "Hiding..." : "Hide"}
        </button>
      </td>
    </tr>
  ));
}

export function RecentCheckInRows({ initialCheckIns }: { initialCheckIns: DashboardCheckIn[] }) {
  const [checkIns, setCheckIns] = useState(initialCheckIns);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function deleteCheckIn(checkIn: DashboardCheckIn) {
    setBusyId(checkIn.id);
    const previous = checkIns;
    setCheckIns((current) => current.filter((item) => item.id !== checkIn.id));

    try {
      const response = await fetch(`/api/admin/check-ins/${checkIn.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");
    } catch {
      setCheckIns(previous);
      alert("Could not delete check-in. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (checkIns.length === 0) {
    return (
      <tr>
        <td className="px-4 py-6 text-white/55" colSpan={4}>
          No check-ins recorded yet.
        </td>
      </tr>
    );
  }

  return checkIns.map((checkIn) => (
    <tr key={checkIn.id} className="border-b border-white/5 last:border-0">
      <td className="px-4 py-3 font-mono text-white/75">{checkIn.userEmail}</td>
      <td className="px-4 py-3 text-white">{checkIn.venueName}</td>
      <td className="px-4 py-3 text-right text-white/60">{timeAgo(checkIn.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => deleteCheckIn(checkIn)}
          disabled={busyId === checkIn.id}
          className="rounded-md border border-red-300/20 px-3 py-1 text-xs font-semibold text-red-200/80 transition hover:border-red-200/50 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busyId === checkIn.id ? "Deleting..." : "Delete"}
        </button>
      </td>
    </tr>
  ));
}
