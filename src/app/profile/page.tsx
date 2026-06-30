"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Heart, LogOut, MapPin } from "lucide-react";
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  const busyness = getBusynessState(item.currentBusyness ?? venue?.signal?.busyness0To100 ?? null);

  return (
    <Card className="group overflow-hidden rounded-[8px] border-white/[0.08] bg-[#14141A] shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <div className="flex h-full flex-col">
        <Link
          href={`/venues/${encodeURIComponent(venueId)}`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          aria-label={venueName}
        >
          <VenuePhoto
            name={venueName}
            photoUrl={venue?.photoUrl ?? venue?.photoUrls?.[0] ?? null}
            photoUrls={venue?.photoUrls}
            className="aspect-[4/3] w-full rounded-none"
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
          />
        </Link>

        <div className="flex flex-1 flex-col gap-4 p-3">
          <div className="min-w-0 space-y-2">
            <h2 className="line-clamp-2 text-base font-black leading-6 tracking-tight text-white">{venueName}</h2>
            <span
              className="inline-flex rounded-full border px-2.5 py-1 text-xs font-black"
              style={{ borderColor: `${busyness.color}66`, color: busyness.color }}
            >
              {busyness.label}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3">
            <Link
              href={`/venues/${encodeURIComponent(venueId)}`}
              className="inline-flex min-h-10 items-center rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-black text-white transition-colors hover:border-[#00F5D4]/40 hover:text-[#00F5D4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => onUnsave(item.venueId)}
              disabled={pending}
              aria-label={`Unsave ${venueName}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.04] text-white/72 transition-colors hover:border-red-300/35 hover:bg-red-400/10 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-55"
            >
              <Heart className="h-4 w-4 fill-current text-[#FF2D78]" aria-hidden="true" />
            </button>
          </div>
        </div>
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
        <Heart className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="mt-6 text-center">
        <h1 className="text-3xl font-black tracking-tight text-white">Save your spots. Know before you go.</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/60">
          Sign in with Google to keep your saved venues in one place and get back to them fast.
        </p>
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
      await fetch("/api/user/saved-venues", {
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
          <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
            <header className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-black tracking-tight text-white">Your saved spots</h1>
              <p className="max-w-[46%] truncate pt-1 text-right text-xs font-semibold text-white/48">
                {session.user.email ?? "Signed in"}
              </p>
            </header>

            <div className="mt-6 flex-1">
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
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mx-auto mt-4 max-w-sm text-base font-black leading-6 text-white">
                    No saved spots yet — explore and save some.
                  </p>
                  <Button
                    asChild
                    className="mt-5 h-11 rounded-[8px] bg-[#8B6CFF] px-5 text-sm font-black text-white hover:bg-[#9B82FF] focus-visible:ring-[#00F5D4]/70"
                  >
                    <Link href="/explore">Explore spots</Link>
                  </Button>
                </Card>
              )}
            </div>

            <div className="mt-auto pt-6">
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
