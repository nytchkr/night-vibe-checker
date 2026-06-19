"use client";

// ============================================================
// /admin — Check-in Moderation
//
// Auth: reads Supabase session; checks email against ADMIN_EMAILS
//       by calling /api/admin/check-ins (server validates).
//       Non-admin users see a 403 message.
// ============================================================

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { AdminCheckInTable } from "@/components/admin/AdminCheckInTable";
import type { AdminCheckIn } from "@/types/admin";

type PageState = "loading" | "unauthorized" | "ready" | "error";

export default function AdminPage() {
  const [state, setState] = useState<PageState>("loading");
  const [checkIns, setCheckIns] = useState<AdminCheckIn[]>([]);
  const [token, setToken] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    async function init() {
      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        setState("unauthorized");
        return;
      }

      const accessToken = session.access_token;
      setToken(accessToken);

      try {
        const res = await fetch("/api/admin/check-ins", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 401) {
          setState("unauthorized");
          return;
        }

        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          setErrorMsg(json.error ?? `Server error ${res.status}`);
          setState("error");
          return;
        }

        const json = await res.json() as { checkIns: AdminCheckIn[] };
        setCheckIns(json.checkIns ?? []);
        setState("ready");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setState("error");
      }
    }

    init();
  }, []);

  // --------------- Render states ----------------------------

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00F5D4]/30 border-t-[#00F5D4] animate-spin" />
      </div>
    );
  }

  if (state === "unauthorized") {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">403</p>
          <p className="text-white/60 text-lg">Access denied.</p>
          <p className="text-white/35 text-sm mt-2">
            Your account is not on the admin list.
          </p>
          <a
            href="/"
            className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-[#00F5D4]/10 text-[#00F5D4] text-sm font-semibold hover:bg-[#00F5D4]/20 transition-colors"
          >
            Go to Feed
          </a>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-white/60 text-lg mb-2">Failed to load check-ins</p>
          <p className="text-red-400 text-sm font-mono">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // --------------- Ready state ------------------------------

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 pb-10">
      {/* Header */}
      <div className="max-w-5xl mx-auto pt-8 pb-6">
        <h1 className="text-xl font-bold text-white tracking-tight">
          Admin — Check-in Moderation
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""} (including hidden)
        </p>
      </div>

      {/* Table */}
      <div className="max-w-5xl mx-auto">
        <AdminCheckInTable initialCheckIns={checkIns} token={token} />
      </div>
    </div>
  );
}
