"use client";

// ============================================================
// AdminCheckInTable — full moderation table
// ============================================================

import { useState } from "react";
import type { AdminCheckIn } from "@/types/admin";
import { AdminCheckInRow } from "./AdminCheckInRow";

interface Props {
  initialCheckIns: AdminCheckIn[];
  token: string;
}

export function AdminCheckInTable({ initialCheckIns, token }: Props) {
  const [checkIns, setCheckIns] = useState<AdminCheckIn[]>(initialCheckIns);

  function handleUpdated(updated: AdminCheckIn) {
    setCheckIns((prev) =>
      prev.map((ci) => (ci.id === updated.id ? updated : ci))
    );
  }

  if (checkIns.length === 0) {
    return (
      <p className="text-white/40 text-center py-12">No check-ins found.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {["Time", "Venue", "Busyness", "Crowd Feel", "Note", "Actions"].map((h) => (
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
          {checkIns.map((ci) => (
            <AdminCheckInRow
              key={ci.id}
              checkIn={ci}
              token={token}
              onUpdated={handleUpdated}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
