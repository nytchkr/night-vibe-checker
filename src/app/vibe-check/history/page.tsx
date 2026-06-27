import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportedBusyness } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check-in History — nytchkr",
  description: "Review your recent nytchkr venue check-ins.",
  alternates: {
    canonical: "/vibe-check/history",
  },
};

type CheckInRow = {
  id: string;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  busyness: ReportedBusyness | null;
  crowd_feel?: string | null;
  createdAt: string;
};

type UserCheckInsApiResponse = {
  data?: {
    checkIns?: CheckInRow[];
  };
  nextCursor?: string | null;
};

type CheckInWeekGroup = {
  key: string;
  label: string;
  checkIns: CheckInRow[];
};

const EASTERN_TIME_ZONE = "America/New_York";
const UNKNOWN_WEEK_KEY = "unknown-week";

const easternDatePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const checkInDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const weekHeaderFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

async function createCookieSupabaseClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getEasternDateParts(date: Date): { year: number; month: number; day: number } | null {
  if (!Number.isFinite(date.getTime())) return null;

  const parts = easternDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function weekInfoFor(value: string): { key: string; label: string } {
  const date = new Date(value);
  const easternParts = getEasternDateParts(date);
  if (!easternParts) return { key: UNKNOWN_WEEK_KEY, label: "Unknown week" };

  const easternDay = new Date(Date.UTC(easternParts.year, easternParts.month - 1, easternParts.day));
  const daysSinceMonday = (easternDay.getUTCDay() + 6) % 7;
  const monday = new Date(easternDay);
  monday.setUTCDate(easternDay.getUTCDate() - daysSinceMonday);

  return {
    key: monday.toISOString().slice(0, 10),
    label: `Week of ${weekHeaderFormatter.format(monday)}`,
  };
}

function groupCheckInsByWeek(checkIns: CheckInRow[]): CheckInWeekGroup[] {
  const groupByKey = new Map<string, CheckInWeekGroup>();

  for (const checkIn of checkIns) {
    const week = weekInfoFor(checkIn.createdAt);
    const existingGroup = groupByKey.get(week.key);

    if (existingGroup) {
      existingGroup.checkIns.push(checkIn);
    } else {
      groupByKey.set(week.key, { ...week, checkIns: [checkIn] });
    }
  }

  return Array.from(groupByKey.values());
}

function formatCheckInDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return checkInDateFormatter
    .format(date)
    .replace(",", "")
    .replace(/\s([AP])M$/, (_, meridiem: string) => meridiem.toLowerCase() + "m");
}

function vibeEmoji(value: string | null | undefined): string | null {
  if (value === "chill") return "😌";
  if (value === "hyped") return "🔥";
  if (value === "mixed") return "✨";
  if (value === "dead") return "🌙";
  if (value === "packed") return "⚡";
  if (value === "mostly_male" || value === "mostly_female" || value === "balanced") return "👥";
  return null;
}

function busynessLabel(value: ReportedBusyness | null): string {
  if (value === "packed") return "Packed";
  if (value === "moderate") return "Moderate";
  if (value === "dead") return "Quiet";
  return "Unknown";
}

function busynessClassName(value: ReportedBusyness | null): string {
  if (value === "packed") return "border-[#FF2D78]/40 bg-[#FF2D78]/15 text-[#FF8AB0]";
  if (value === "moderate") return "border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FCD58B]";
  if (value === "dead") return "border-[#00F5D4]/35 bg-[#00F5D4]/10 text-[#76FFE9]";
  return "border-white/15 bg-white/10 text-white/60";
}

async function loadCheckIns(): Promise<CheckInRow[]> {
  const supabase = await createCookieSupabaseClient();
  const [{ data: authData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = authData.user;
  const accessToken = sessionData.session?.access_token;

  if (!user || !accessToken) {
    redirect("/login?return=/vibe-check/history");
  }

  const response = await fetch(await apiUrl("/api/user/check-ins"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/login?return=/vibe-check/history");
  }

  if (!response.ok) {
    throw new Error("Could not load check-in history.");
  }

  const payload = (await response.json()) as UserCheckInsApiResponse;
  return payload.data?.checkIns ?? [];
}

async function apiUrl(path: string): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}${path}`;
}

export default async function VibeCheckHistoryPage() {
  const checkIns = await loadCheckIns();
  const weekGroups = groupCheckInsByWeek(checkIns);

  return (
    <div className="min-h-screen-safe bg-[#0A0A0F] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-3">
          <Link
            href="/profile"
            className="inline-flex min-h-11 items-center text-sm font-bold text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
          >
            Back to You
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00F5D4]">Your nights</p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-normal text-white">
              Check-in history
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Your latest venue reports, newest first.
            </p>
          </div>
        </header>

        {checkIns.length === 0 ? (
          <Card className="border-white/[0.08] bg-[#111118]">
            <CardContent className="flex flex-col items-center px-6 py-12 text-center">
              <MapPin className="h-8 w-8 text-[#FF2D78]" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-white">
                No check-ins yet
              </h2>
              <p className="mt-2 text-sm font-semibold leading-5 text-white/55">
                Find somewhere to go tonight and check in when you arrive.
              </p>
              <Link
                href="/explore"
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#8B6CFF] px-5 text-sm font-bold text-white transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
              >
                Explore venues
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div>
            {weekGroups.map((group) => (
              <section key={group.key} aria-labelledby={`check-ins-${group.key}`}>
                <h2
                  id={`check-ins-${group.key}`}
                  className="mt-6 mb-2 text-[11px] uppercase tracking-widest text-white/40"
                >
                  {group.label}
                </h2>
                <ul className="space-y-3">
                  {group.checkIns.map((checkIn) => {
                    const venueName = checkIn.venueName ?? "Unknown venue";
                    const hasVenueName = Boolean(checkIn.venueName);
                    const address = checkIn.venueAddress ?? "Address not available";
                    const emoji = vibeEmoji(checkIn.crowd_feel);

                    return (
                      <li key={checkIn.id}>
                        <Card className="border-white/[0.08] bg-[#111118] shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  {emoji ? (
                                    <span className="shrink-0 text-base leading-none" aria-hidden="true">
                                      {emoji}
                                    </span>
                                  ) : null}
                                  {checkIn.venueId ? (
                                    <Link
                                      href={`/venues/${checkIn.venueId}`}
                                      className={`truncate text-base font-black transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
                                        hasVenueName ? "text-white" : "text-white/40"
                                      }`}
                                    >
                                      {venueName}
                                    </Link>
                                  ) : (
                                    <span
                                      className={`truncate text-base font-black ${
                                        hasVenueName ? "text-white" : "text-white/40"
                                      }`}
                                    >
                                      {venueName}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 flex items-start gap-1.5 text-sm leading-5 text-white/55">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#00F5D4]" aria-hidden="true" />
                                  <span>{address}</span>
                                </p>
                              </div>
                              <Badge className={`shrink-0 ${busynessClassName(checkIn.busyness)}`}>
                                {busynessLabel(checkIn.busyness)}
                              </Badge>
                            </div>

                            <time
                              dateTime={checkIn.createdAt}
                              className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/45"
                            >
                              <Clock className="h-3.5 w-3.5 text-[#FF2D78]" aria-hidden="true" />
                              {formatCheckInDate(checkIn.createdAt)}
                            </time>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
