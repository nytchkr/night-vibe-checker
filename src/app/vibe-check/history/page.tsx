import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
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

type VenueRelation = {
  name?: string | null;
  address?: string | null;
};

type CheckInRow = {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  busyness: ReportedBusyness | null;
  created_at: string;
  venues?: VenueRelation | VenueRelation[] | null;
};

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

function venueFrom(row: CheckInRow): VenueRelation | null {
  const relation = row.venues;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function formatTimeAgo(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} ${diffYears === 1 ? "year" : "years"} ago`;
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
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    redirect("/login?return=/vibe-check/history");
  }

  const { data, error } = await supabase
    .from("check_ins")
    .select("*, venues!inner(name,address)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Could not load check-in history: ${error.message}`);
  }

  return (data ?? []) as CheckInRow[];
}

export default async function VibeCheckHistoryPage() {
  const checkIns = await loadCheckIns();

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
                No check-ins yet — find somewhere to go tonight!
              </h2>
              <Link
                href="/explore"
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#8B6CFF] px-5 text-sm font-bold text-white transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
              >
                Explore venues
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {checkIns.map((checkIn) => {
              const venue = venueFrom(checkIn);
              const venueName = venue?.name ?? "Unknown venue";
              const address = venue?.address ?? "Address not available";

              return (
                <li key={checkIn.id}>
                  <Card className="border-white/[0.08] bg-[#111118] shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-black text-white">{venueName}</h2>
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
                        dateTime={checkIn.created_at}
                        className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/45"
                      >
                        <Clock className="h-3.5 w-3.5 text-[#FF2D78]" aria-hidden="true" />
                        {formatTimeAgo(checkIn.created_at)}
                      </time>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
