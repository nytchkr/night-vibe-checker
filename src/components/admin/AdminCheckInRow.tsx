"use client";

// ============================================================
// AdminCheckInRow — single moderation table row
//
// Optimistic update: flips hidden immediately, reverts on error.
// ============================================================

import { useState } from "react";
import type { AdminCheckIn } from "@/types/admin";

interface Props {
  checkIn: AdminCheckIn;
  token: string;
  onUpdated: (checkIn: AdminCheckIn) => void;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function AdminCheckInRow({ checkIn, token, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);

  async function toggleHidden() {
    setBusy(true);
    // Optimistic update
    const next = { ...checkIn, hidden: !checkIn.hidden };
    onUpdated(next);

    try {
      const res = await fetch(`/api/admin/check-ins/${checkIn.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hidden: next.hidden }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      const json = await res.json() as { checkIn: AdminCheckIn };
      onUpdated(json.checkIn);
    } catch {
      // Revert on failure
      onUpdated(checkIn);
    } finally {
      setBusy(false);
    }
  }

  const truncatedNote = checkIn.note
    ? checkIn.note.length > 60
      ? checkIn.note.slice(0, 60) + "…"
      : checkIn.note
    : null;

  return (
    <tr
      className={`border-b border-white/[0.06] transition-colors hover:bg-white/[0.02] ${
        checkIn.hidden ? "bg-white/[0.015] text-white/35 line-through decoration-white/35" : ""
      }`}
    >
      <td className="px-3 py-2.5 text-sm text-white/40 whitespace-nowrap">
        {timeAgo(checkIn.createdAt)}
      </td>

      <td className="px-3 py-2.5 text-sm text-white/70 font-mono max-w-[150px] truncate">
        {checkIn.venueName ?? checkIn.venueId.slice(0, 16) + "…"}
      </td>

      <td className="px-3 py-2.5">
        <span className={`
          inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
          ${checkIn.busyness === "packed" ? "bg-[#F0568C]/20 text-[#F0568C]" :
            checkIn.busyness === "moderate" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-white/10 text-white/50"}
        `}>
          {checkIn.busyness}
        </span>
      </td>

      <td className="px-3 py-2.5 text-sm text-white/60">
        {checkIn.crowdFeel.replace("_", " ")}
      </td>

      <td className="px-3 py-2.5 text-sm text-white/50 max-w-[200px]">
        {truncatedNote ?? <span className="text-white/35 italic">—</span>}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleHidden}
            disabled={busy}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-40"
          >
            {checkIn.hidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </td>
    </tr>
  );
}
