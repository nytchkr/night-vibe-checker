import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { ConsumerVenue, VenueSignal } from "@/types";
import { VenuePageClient } from "./VenuePageClient";

const siteUrl = "https://night-vibe-checker.vercel.app";
const fallbackTitle = "NightVibe — South End Charlotte";
const fallbackDescription = "See how busy South End bars and clubs are right now. Real-time crowd vibes.";
const fallbackImage = "/og-image.png";

export const dynamic = "force-dynamic";

type VenuePageProps = {
  params: Promise<{ id: string }>;
};

function mapSignal(row: Record<string, unknown> | undefined): VenueSignal | null {
  if (!row) return null;
  return {
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    busyness0To100: (row.busyness_0_100 ?? null) as number | null,
    busynessSource: (row.busyness_source ?? null) as VenueSignal["busynessSource"],
    mfRatio: (row.mf_ratio ?? null) as number | null,
    confidence0To1: Number(row.confidence_0_1 ?? 0),
    sampleSize: Number(row.sample_size ?? 0),
    computedAt: row.computed_at as string,
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

function mapVenue(row: Record<string, unknown>): ConsumerVenue {
  const signalRows = (row.venue_signals ?? []) as Record<string, unknown>[];
  return {
    id: row.id as string,
    slug: (row.slug ?? undefined) as string | undefined,
    placeId: row.place_id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    address: row.address as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    openNow: row.open_now == null ? undefined : Boolean(row.open_now),
    hidden: Boolean(row.hidden),
    signal: mapSignal(signalRows[0]),
  };
}

async function getVenue(id: string): Promise<ConsumerVenue | null> {
  const venueId = decodeURIComponent(id).trim();
  if (!venueId) return null;

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(`
      id, place_id, zone_id, name, address, lat, lng, venue_type, category,
      slug,
      google_rating, total_ratings, price_level, photo_reference, photo_url, open_now, hidden,
      venue_signals (
        venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
        confidence_0_1, sample_size, computed_at, last_busyness_refresh
      )
    `)
    .or(`id.eq.${venueId},place_id.eq.${venueId}`)
    .eq("hidden", false)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapVenue(data as Record<string, unknown>);
}

function getVenueDescription(venue: ConsumerVenue): string {
  const busyness = venue.signal?.busyness0To100;
  if (typeof busyness === "number") {
    return `${venue.name} is currently ${Math.round(busyness)}/100 busy in South End Charlotte. See who's out tonight on NightVibe.`;
  }

  return `See the live crowd vibe at ${venue.name} in South End Charlotte.`;
}

export async function generateMetadata({ params }: VenuePageProps): Promise<Metadata> {
  const { id } = await params;
  const venue = await getVenue(id);
  const title = venue ? `${venue.name} — NightVibe` : fallbackTitle;
  const description = venue ? getVenueDescription(venue) : fallbackDescription;
  const image = venue?.photoUrl ?? fallbackImage;
  const url = `${siteUrl}/venues/${encodeURIComponent(venue?.id ?? id)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "NightVibe",
      images: [
        {
          url: image,
          alt: title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();

  return (
    <>
      <link rel="canonical" href={`${siteUrl}/venues/${venue.id}`} />
      <VenuePageClient venueId={id} initialVenue={venue} />
    </>
  );
}
