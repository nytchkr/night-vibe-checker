"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, UsersRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { PageTransition } from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { CrowdFeel, ReportedBusyness } from "@/types";

type ProfileCheckInRecord = {
  id: string;
  venue_id: string | null;
  venue_name: string | null;
  busyness: ReportedBusyness | null;
  crowd_feel: CrowdFeel | null;
  note: string | null;
  created_at: string;
};

type CheckInItem = {
  id: string;
  venueId: string;
  venueName: string;
  busyness: ReportedBusyness | null;
  crowdFeel: CrowdFeel | null;
  note: string | null;
  createdAt: string;
};

function getVenueName(row: ProfileCheckInRecord): string {
  return row.venue_name ?? row.venue_id ?? "Unknown venue";
}

function formatBusyness(value: ReportedBusyness): string {
  if (value === "dead") return "Dead";
  if (value === "moderate") return "Moderate";
  return "Packed";
}

function formatCrowdFeel(value: CrowdFeel): string {
  if (value === "mostly_male") return "More guys";
  if (value === "mostly_female") return "More women";
  if (value === "balanced") return "Balanced";
  return "Mixed";
}

function getBusynessChipClass(value: ReportedBusyness): string {
  if (value === "dead") return "bg-white/[0.08] text-[#D1D5DB] ring-white/[0.12]";
  if (value === "moderate") return "bg-yellow-400/15 text-yellow-200 ring-yellow-300/20";
  return "bg-red-500/15 text-red-200 ring-red-400/25";
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return "Just now";

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatDateGroup(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const itemDate = new Date(date);
  itemDate.setHours(0, 0, 0, 0);

  if (itemDate.getTime() === today.getTime()) return "Today";
  if (itemDate.getTime() === yesterday.getTime()) return "Yesterday";

  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function groupCheckIns(checkIns: CheckInItem[]) {
  const groups = new Map<string, CheckInItem[]>();

  for (const checkIn of checkIns) {
    const label = formatDateGroup(checkIn.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), checkIn]);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function LoadingRows() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading check-ins">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 rounded-[18px] bg-white/10" />
      ))}
    </div>
  );
}

function CheckInRow({ item }: { item: CheckInItem }) {
  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-bold text-[#F4F5F8]">{item.venueName}</p>
        <time
          className="shrink-0 text-right text-[12px] font-medium text-[#9CA2AE]"
          dateTime={item.createdAt}
        >
          {formatRelativeTime(item.createdAt)}
        </time>
      </div>

      {item.busyness && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${getBusynessChipClass(item.busyness)}`}
          >
            {formatBusyness(item.busyness)}
          </span>
        </div>
      )}

      {item.crowdFeel && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#9CA2AE]">
          {item.crowdFeel === "balanced" && (
            <UsersRound className="h-3.5 w-3.5 text-[#8B6CFF]" strokeWidth={2.3} aria-hidden="true" />
          )}
          <span>{formatCrowdFeel(item.crowdFeel)}</span>
        </p>
      )}

      {item.note && (
        <p className="mt-2 text-[13px] font-medium italic leading-5 text-[#D6DAE2]">{item.note}</p>
      )}
    </>
  );

  const cardClassName =
    "block rounded-[18px] border border-white/10 bg-white/5 p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60";

  if (!item.venueId) {
    return <li className={cardClassName}>{cardContent}</li>;
  }

  return (
    <li>
      <Link
        href={`/venues/${encodeURIComponent(item.venueId)}`}
        className={`${cardClassName} hover:border-[#8B6CFF]/35 hover:bg-white/[0.07]`}
      >
        {cardContent}
      </Link>
    </li>
  );
}

export default function ProfileCheckInsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCheckIns() {
      setLoading(true);
      setError("");

      try {
        const client = createBrowserClient();
        const { data } = await client.auth.getSession();
        const session: Session | null = data.session;

        if (!session?.access_token) {
          if (!cancelled) {
            setCheckIns([]);
            setError("Sign in to view your check-in history.");
          }
          return;
        }

        const res = await fetch("/api/profile/check-ins", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          if (!cancelled) {
            setCheckIns([]);
            setError("Could not load your check-ins right now.");
          }
          return;
        }

        const rows = (await res.json()) as ProfileCheckInRecord[];
        if (cancelled) return;

        setCheckIns(
          (Array.isArray(rows) ? rows : []).map((row) => ({
            id: row.id,
            venueId: row.venue_id ?? "",
            venueName: getVenueName(row),
            busyness: row.busyness,
            crowdFeel: row.crowd_feel,
            note: row.note,
            createdAt: row.created_at,
          })),
        );
      } catch {
        if (!cancelled) {
          setCheckIns([]);
          setError("Could not load your check-ins right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCheckIns();

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedCheckIns = useMemo(() => groupCheckIns(checkIns), [checkIns]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0A0A0E] text-white">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <Link
              href="/profile"
              className="inline-flex min-h-9 items-center text-[13px] font-semibold text-[#9CA2AE] transition-colors hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
            >
              &larr; You
            </Link>
            <h1 className="mt-2 font-display text-[30px] font-semibold tracking-normal text-[#F4F5F8]">
              Check-in history
            </h1>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 py-6 pb-20">
          {loading && <LoadingRows />}

          {!loading && error && (
            <p className="rounded-[18px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-[13px] font-medium text-[#F0568C]">
              {error}
            </p>
          )}

          {!loading && !error && checkIns.length === 0 && (
            <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-9 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF] ring-1 ring-[#8B6CFF]/25">
                <MapPin size={22} strokeWidth={2.4} aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-[17px] font-semibold text-[#F4F5F8]">No check-ins yet</h2>
              <Link
                href="/map"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
              >
                Find venues on the map
              </Link>
            </section>
          )}

          {!loading && !error && groupedCheckIns.length > 0 && (
            <div className="space-y-6">
              {groupedCheckIns.map((group) => (
                <section key={group.label} aria-labelledby={`check-ins-${group.label}`}>
                  <h2 id={`check-ins-${group.label}`} className="mb-3 text-[13px] font-semibold uppercase text-[#9CA2AE]">
                    {group.label}
                  </h2>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <CheckInRow key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
