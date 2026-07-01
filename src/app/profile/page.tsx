"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Heart, LogOut } from "lucide-react";
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-[20px] bg-white/10" />
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
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
    <Card className="group overflow-hidden rounded-[20px] border-white/[0.08] bg-white/[0.035] shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <div className="flex h-full flex-col">
        <Link
          href={`/venues/${encodeURIComponent(venueId)}`}
          className="relative block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          aria-label={venueName}
        >
          <VenuePhoto
            name={venueName}
            photoUrl={venue?.photoUrl ?? venue?.photoUrls?.[0] ?? null}
            photoUrls={venue?.photoUrls}
            className="aspect-[4/3] w-full rounded-none"
            sizes="(min-width: 1024px) 320px, 50vw"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex min-h-16 items-end bg-gradient-to-t from-black/88 via-black/30 to-transparent p-3">
            <h2 className="line-clamp-2 font-display text-[15px] font-black leading-tight tracking-normal text-[#F4F5F8]">
              {venueName}
            </h2>
          </div>
        </Link>

        <div className="flex flex-1 flex-col gap-3 p-3">
          <div className="min-w-0 space-y-2">
            <span
              className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black"
              style={{ borderColor: `${busyness.color}66`, color: busyness.color }}
            >
              {busyness.label}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3">
            <Link
              href={`/venues/${encodeURIComponent(venueId)}`}
              className="inline-flex min-h-9 items-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/14 px-4 text-sm font-black text-[#F4F5F8] transition-colors hover:border-[#8B6CFF]/70 hover:bg-[#8B6CFF]/24 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => onUnsave(item.venueId)}
              disabled={pending}
              aria-label={`Unsave ${venueName}`}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/72 transition-colors hover:border-[#F0568C]/45 hover:bg-[#F0568C]/10 hover:text-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0568C]/60 disabled:opacity-55"
            >
              <Heart className="h-4 w-4 fill-current text-[#F0568C]" aria-hidden="true" />
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
  const featurePills = ["❤ Save your spots", "🔔 Vibe alerts", "📍 Charlotte picks"];

  return (
    <section className="min-h-[calc(100dvh-9rem)]">
      <div className="-mx-4 rounded-b-[22px] bg-gradient-to-b from-[#8B6CFF]/15 to-transparent px-4 pb-8 pt-12 text-center">
        <p className="font-display text-[46px] font-black leading-none tracking-normal text-[#F4F5F8] sm:text-[56px]">
          nytchkr
        </p>
        <h1 className="mx-auto mt-7 max-w-sm font-display text-[32px] font-black leading-[1.05] tracking-normal text-[#F4F5F8]">
          Know before you go.
        </h1>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {featurePills.map((label) => (
          <div
            key={label}
            className="inline-flex shrink-0 items-center rounded-full border border-[#8B6CFF]/35 bg-white/[0.035] px-4 py-2 text-sm font-bold text-[#F4F5F8]"
          >
            <span>{label}</span>
          </div>
        ))}
      </div>

      <Card className="mt-7 rounded-[22px] border-white/[0.08] bg-white/[0.035] p-4">
        <Button
          type="button"
          disabled={submitting}
          onClick={onSignIn}
          className="h-14 w-full rounded-full bg-[#8B6CFF] font-display text-base font-black text-[#F4F5F8] shadow-[0_0_34px_rgba(139,108,255,0.30)] hover:bg-[#9B82FF] focus-visible:ring-[#00F5D4]/70"
        >
          <GoogleIcon />
          {submitting ? "Connecting..." : "Continue with Google"}
        </Button>
        <p className="mt-4 text-center text-sm font-medium text-[#646B79]">No password needed · Free forever</p>
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
              <div className="min-w-0">
                <h1 className="font-display text-[28px] font-black leading-tight tracking-normal text-[#F4F5F8]">
                  Your saved spots{" "}
                  <span className="text-[#8B6CFF]">({savedVenues.length})</span>
                </h1>
              </div>
              <p className="max-w-[42%] truncate pt-1 text-right text-xs font-semibold text-[#646B79]">
                {session.user.email ?? "Signed in"}
              </p>
            </header>

            <div className="mt-6 flex-1">
              {savedLoading ? (
                <ProfileSkeleton />
              ) : savedVenues.length > 0 ? (
                <section aria-label="Saved spots" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
                <Card className="rounded-[22px] border-white/[0.08] bg-white/[0.035] p-7 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[#8B6CFF]/45 bg-[#8B6CFF]/10 text-[#8B6CFF]">
                    <Heart className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h2 className="mx-auto mt-5 max-w-sm font-display text-[24px] font-black leading-tight tracking-normal text-[#F4F5F8]">
                    No saved spots yet
                  </h2>
                  <Button
                    asChild
                    className="mt-5 h-12 rounded-full bg-[#8B6CFF] px-6 font-display text-sm font-black text-[#F4F5F8] hover:bg-[#9B82FF] focus-visible:ring-[#00F5D4]/70"
                  >
                    <Link href="/explore">Browse Charlotte venues</Link>
                  </Button>
                </Card>
              )}
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm font-bold text-[#646B79] transition-colors hover:text-[#9CA2AE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
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
