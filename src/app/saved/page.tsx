"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Heart, Loader2, LogOut, Mail } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { VenuePhoto } from "@/components/VenuePhoto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
type SavedVenue = {
  id: string;
  name: string;
  category: string;
  openNow: boolean | null;
  photoUrl?: string;
  photoUrls?: string[];
};

type SavedVenuesResponse = {
  savedVenues?: SavedVenue[];
  error?: string;
};

function openNowLabel(openNow: boolean | null | undefined) {
  if (openNow === true) return "Open now";
  if (openNow === false) return "Closed";
  return "Hours unknown";
}

function openNowClassName(openNow: boolean | null | undefined) {
  if (openNow === true) return "border-[#00F5D4]/30 bg-[#00F5D4]/10 text-[#00F5D4]";
  if (openNow === false) return "border-white/10 bg-white/[0.05] text-white/55";
  return "border-[#8B6CFF]/25 bg-[#8B6CFF]/10 text-[#B9AAFF]";
}

function SavedSkeleton() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading saved venues">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="overflow-hidden rounded-[8px] border-white/[0.08] bg-[#14141A]">
          <Skeleton className="h-36 rounded-none bg-white/10" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3 rounded-[8px] bg-white/10" />
            <Skeleton className="h-3 w-28 rounded-[8px] bg-white/10" />
            <Skeleton className="h-7 w-20 rounded-full bg-white/10" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function LoggedOutState({
  signingIn,
  onSignIn,
}: {
  signingIn: boolean;
  onSignIn: () => void;
}) {
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col justify-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#FF2D78]/35 bg-[#FF2D78]/12 text-[#FF8AB0] shadow-[0_0_34px_rgba(255,45,120,0.22)]">
          <Heart className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-normal text-white">Sign in to save venues</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/62">
          Keep a shortlist of places for tonight and jump back to them from the Saved tab.
        </p>

        <div className="mt-8">
          <Button
            type="button"
            onClick={onSignIn}
            disabled={signingIn}
            className="h-12 w-full rounded-full bg-[#8B6CFF] text-sm font-black text-[#0A0A0E] hover:bg-[#A896FF] focus-visible:ring-[#8B6CFF]/70"
          >
            {signingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Continue with Google
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SavedVenueCard({ venue }: { venue: SavedVenue }) {
  return (
    <Card className="overflow-hidden rounded-[8px] border-white/[0.08] bg-[#14141A]">
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <VenuePhoto
          name={venue.name}
          photoUrl={venue.photoUrl}
          photoUrls={venue.photoUrls}
          className="h-36 w-full"
          imageClassName="transition-transform duration-300 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, 360px"
        />
      </Link>
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="block p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <h2 className="truncate text-base font-black tracking-normal text-white">{venue.name}</h2>
        <p className="mt-1 truncate text-xs font-bold uppercase text-white/45">{venue.category}</p>
        <Badge className={`mt-3 ${openNowClassName(venue.openNow)}`}>
          {openNowLabel(venue.openNow)}
        </Badge>
      </Link>
    </Card>
  );
}

export default function SavedPage() {
  const { data: session, status } = useSession();
  const [savedVenues, setSavedVenues] = useState<SavedVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedVenues() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/user/saved-venues", {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await response.json()) as SavedVenuesResponse;

        if (!response.ok) {
          throw new Error(json.error || "Could not load saved venues.");
        }

        if (!cancelled) setSavedVenues(json.savedVenues ?? []);
      } catch {
        if (!cancelled) {
          setSavedVenues([]);
          setLoadError("Could not load your saved venues right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!session?.user?.id) {
      setSavedVenues([]);
      setLoading(false);
      setLoadError("");
      return () => {
        cancelled = true;
      };
    }

    void loadSavedVenues();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function handleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    await signIn("google", { callbackUrl: "/saved" });
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/" });
  }

  return (
    <PageTransition>
      <div className="mx-auto min-h-screen-safe w-full max-w-lg bg-[#0A0A0E] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 text-white">
        {status === "loading" && <SavedSkeleton />}

        {status === "unauthenticated" && (
          <LoggedOutState
            signingIn={signingIn}
            onSignIn={() => void handleSignIn()}
          />
        )}

        {status === "authenticated" && session && (
          <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-[#8B6CFF]">nytchkr</p>
                <h1 className="mt-1 text-3xl font-black tracking-normal text-white">Saved</h1>
                <p className="mt-2 text-sm font-semibold text-white/55">
                  {savedVenues.length === 1 ? "1 place you love" : `${savedVenues.length} places you love`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleSignOut}
                className="h-10 shrink-0 rounded-full border border-white/10 px-3 text-xs font-bold text-white/65 hover:bg-white/[0.06] hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </header>

            {loading && <SavedSkeleton />}

            {!loading && loadError && (
              <p className="rounded-[8px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-sm font-semibold text-[#FF8AB0]" role="alert">
                {loadError}
              </p>
            )}

            {!loading && !loadError && savedVenues.length === 0 && (
              <section className="rounded-[8px] border border-white/[0.08] bg-white/[0.04] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#FF2D78]/25 bg-[#FF2D78]/10 text-[#FF8AB0]" aria-hidden="true">
                  <Heart className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-black text-white">No saved places yet</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/60">
                  Tap ♡ on any venue to save it for later
                </p>
                <Button asChild className="mt-5 h-11 rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] hover:bg-[#A896FF]">
                  <Link href="/explore">Explore venues</Link>
                </Button>
              </section>
            )}

            {!loading && !loadError && savedVenues.length > 0 && (
              <section className="grid gap-4" aria-label="Saved venues">
                {savedVenues.map((venue) => (
                  <SavedVenueCard key={venue.id} venue={venue} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
