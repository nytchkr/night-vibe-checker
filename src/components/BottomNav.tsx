"use client";

// ============================================================
// BottomNav  — NV-063
//
// Tabs: Feed (/) | Report (/vibe-check) | Me (/profile)
// Report tab is visually dominant — neon-cyan pill elevated above bar
// Internal/admin routes suppress consumer nav
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

// --------------- Icons --------------------------------------

function FeedIcon({ filled }: { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" stroke={filled ? "none" : "currentColor"} fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function MeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  );
}

// --------------- Nav ----------------------------------------

export function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/internal") || pathname.startsWith("/agent-board") || pathname.startsWith("/admin")) {
    return null;
  }

  const feedActive = pathname === "/";
  const reportActive = pathname.startsWith("/vibe-check");
  const meActive = pathname.startsWith("/profile");

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#07070B]/92 backdrop-blur-2xl safe-area-inset-bottom"
    >
      <div className="mx-auto flex w-full max-w-lg items-end px-3 py-2">

        {/* Feed */}
        <Link
          href="/"
          aria-label="Feed"
          aria-current={feedActive ? "page" : undefined}
          className={`
            relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5
            transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50
            ${feedActive ? "bg-white/[0.07] text-[#00F5D4] shadow-[0_0_18px_rgba(0,245,212,0.08)]" : "text-white/38 hover:bg-white/[0.04] hover:text-white/75"}
          `}
        >
          <FeedIcon filled={feedActive} />
          <span className="text-[10px] font-semibold tracking-wide">Feed</span>
          {feedActive && <span className="absolute bottom-1 h-0.5 w-7 rounded-full bg-[#00F5D4]/80" />}
        </Link>

        {/* Report — dominant center tab */}
        <Link
          href="/vibe-check"
          aria-label="Report"
          aria-current={reportActive ? "page" : undefined}
          className="relative flex flex-col items-center justify-center gap-1 px-5 py-2.5 rounded-2xl mx-1 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
          style={{
            background: reportActive
              ? "linear-gradient(135deg, #00dfc0 0%, #00F5D4 100%)"
              : "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)",
            boxShadow: "0 0 24px rgba(0,245,212,0.5), 0 -4px 12px rgba(0,245,212,0.2)",
            marginBottom: "2px",
          }}
        >
          <span style={{ color: "#0A0A0F" }}>
            <ReportIcon />
          </span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: "#0A0A0F" }}>Report</span>
        </Link>

        {/* Me */}
        <Link
          href="/profile"
          aria-label="Me"
          aria-current={meActive ? "page" : undefined}
          className={`
            relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5
            transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50
            ${meActive ? "bg-white/[0.07] text-[#00F5D4] shadow-[0_0_18px_rgba(0,245,212,0.08)]" : "text-white/38 hover:bg-white/[0.04] hover:text-white/75"}
          `}
        >
          <MeIcon filled={meActive} />
          <span className="text-[10px] font-semibold tracking-wide">Me</span>
          {meActive && <span className="absolute bottom-1 h-0.5 w-7 rounded-full bg-[#00F5D4]/80" />}
        </Link>

      </div>
    </nav>
  );
}

export default BottomNav;
