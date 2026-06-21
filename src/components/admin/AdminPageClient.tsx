"use client";

import { AdminCheckInTable } from "@/components/admin/AdminCheckInTable";
import { AdminVenueTable } from "@/components/admin/AdminVenueTable";
import type { AdminCheckIn, AdminVenue } from "@/types/admin";

interface AdminPageClientProps {
  checkIns: AdminCheckIn[];
  venues: AdminVenue[];
  token: string;
}

export function AdminPageClient({ checkIns, venues, token }: AdminPageClientProps) {
  return (
    <div className="min-h-screen bg-[#0A0A0E] px-4 pb-10">
      <div className="max-w-5xl mx-auto pt-8 pb-6">
        <h1 className="text-xl font-bold text-white tracking-tight">
          Admin Moderation
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""} and{" "}
          {venues.length} venue{venues.length !== 1 ? "s" : ""} (including hidden)
        </p>
      </div>

      <div className="max-w-5xl mx-auto space-y-8">
        <AdminCheckInTable initialCheckIns={checkIns} token={token} />
        <AdminVenueTable initialVenues={venues} token={token} />
      </div>
    </div>
  );
}
