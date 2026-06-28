"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Heart, LogOut, Mail } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { VenuePhoto } from "@/components/VenuePhoto";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedVenues, type SavedVenue } from "@/hooks/useSavedVenues";
import { getBusynessState } from "@/lib/busyness";

function ProfileSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading profile">
      <Skeleton className="h-5 w-52 bg-white/10" />
      <Skeleton className="h-9 w-64 bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-[8px] bg-white/10" />
        ))}
      </div>
    </div>
  );
}

function SavedVenueCard({
  item,
  onUnsave,
  pending,
}: {
  item: SavedVenue;
  onUnsave: (venueId: string) => void;
  pending: boolean;
}) {
  const venue = item.venue;
  const venueId = venue?.id ?? item.venueId;
  const venueName = venue?.name ?? "Saved venue";
  const category = venue?.category ?? "Venue";
  const busyness = getBusynessState(item.currentBusyness ?? venue?.signal?.busyness0To100 ?? null);
  const openNow = venue?.openNow ?? venue?.open_now ?? venue?.opening_hours?.open_now ?? null;

  return (
    <Card className="group overflow-hidden rounded-[8px] border-white/[0.08] bg-[#14141A] shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <Link
        href={`/venues/${encodeURIComponent(venueId)}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <VenuePhoto
          name={venueName}
          photoUrl={venue?.photoUrl ?? venue?.photoUrls?.[0] ?? null}
          className="h-36 w-full border-b border-white/[0.06]"
          sizes="(max-width: 640px) calc(100vw - 2rem), 240px"
        />
        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black leading-6 tracking-tight text-white">{venueName}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-white/48">{category}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-2.5 py-1 text-xs font-black"
              style={{ borderColor: `${busyness.color}66`, color: busyness.color }}
            >
              {busyness.label}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                openNow === true
                  ? "border-green-400/35 bg-green-400/10 text-green-300"
                  : "border-white/10 bg-white/[0.04] text-white/42"
              }`}
            >
              {openNow === true ? "Open now" : openNow === false ? "Closed" : "Hours unknown"}
            </span>
          </div>
        </div>
      </Link>

      <div className="border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={() => onUnsave(item.venueId)}
          disabled={pending}
          aria-label={`Unsave ${venueName}`}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-bold text-white/72 transition-colors hover:border-red-300/35 hover:bg-red-400/10 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-55"
        >
          <Heart className="h-4 w-4 fill-current text-[#FF2D78]" aria-hidden="true" />
          Unsave
        </button>
      </div>
    </Card>
  );
}

function LoggedOutState({
  submitting,
  onSignIn,
}: {
  submitting: boolean;
  onSignIn: () => void;
}) {
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col justify-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#00F5D4]/25 bg-[#00F5D4]/10 text-[#00F5D4]">
        <Mail className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-black tracking-tight text-white">Sign in to save your favourite spots</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/60">nytchkr remembers the places you love</p>
      </div>

      <Card className="mt-7 rounded-[8px] border-white/[0.08] bg-[#14141A] p-4">
        <Button
          type="button"
          disabled={submitting}
          onClick={onSignIn}
          className="h-12 w-full rounded-[8px] bg-[#8B6CFF] text-sm font-black text-white hover:bg-[#9B82FF] focus-visible:ring-[#00F5D4]/70"
        >
          {submitting ? "Connecting..." : "Continue with Google"}
        </Button>
      </Card>
    </section>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { loading: savedLoading, refresh, savedVenues } = useSavedVenues();
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  async function handleSignIn() {
    setSubmittingEmail(true);
    await signIn("google", { callbackUrl: "/profile" });
  }

  async function handleUnsave(venueId: string) {
    if (!session || unsavingId) return;

    setUnsavingId(venueId);
    try {
      await fetch("/api/saved-venues", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ venueId }),
      });
      await refresh();
    } finally {
      setUnsavingId(null);
    }
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/" });
  }

  return (
    <PageTransition>
      <main className="mx-auto min-h-screen-safe w-full max-w-5xl bg-[#0A0A0E] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 text-white">
        {status === "loading" && <ProfileSkeleton />}

        {status === "unauthenticated" && (
          <LoggedOutState
            submitting={submittingEmail}
            onSignIn={() => void handleSignIn()}
          />
        )}

        {status === "authenticated" && session && (
          <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-black tracking-tight text-white">Your saved spots</h1>
              <p className="max-w-[46%] truncate pt-1 text-right text-xs font-semibold text-white/48">
                {session.user.email ?? "Signed in"}
              </p>
            </header>

            {savedLoading ? (
              <ProfileSkeleton />
            ) : savedVenues.length > 0 ? (
              <section aria-label="Saved spots" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedVenues.map((item) => (
                  <SavedVenueCard
                    key={item.venueId}
                    item={item}
                    pending={unsavingId === item.venueId}
                    onUnsave={(venueId) => void handleUnsave(venueId)}
                  />
                ))}
              </section>
            ) : (
              <Card className="rounded-[8px] border-white/[0.08] bg-[#14141A] p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#FF2D78]/25 bg-[#FF2D78]/10 text-[#FF8AB0]">
                  <Heart className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mx-auto mt-4 max-w-sm text-base font-black leading-6 text-white">
                  You haven&apos;t saved any spots yet. Tap ♡ on a venue to save it.
                </p>
              </Card>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm font-bold text-red-300 transition-colors hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </main>
    </PageTransition>
  );
}
