"use client";

import { AdminCheckInTable } from "@/components/admin/AdminCheckInTable";
import type { AdminCheckIn } from "@/types/admin";

interface AdminPageClientProps {
  checkIns: AdminCheckIn[];
  token: string;
}

export function AdminPageClient({ checkIns, token }: AdminPageClientProps) {
  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 pb-10">
      <div className="max-w-5xl mx-auto pt-8 pb-6">
        <h1 className="text-xl font-bold text-white tracking-tight">
          Admin — Check-in Moderation
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""} (including hidden)
        </p>
      </div>

      <div className="max-w-5xl mx-auto">
        <AdminCheckInTable initialCheckIns={checkIns} token={token} />
      </div>
    </div>
  );
}
