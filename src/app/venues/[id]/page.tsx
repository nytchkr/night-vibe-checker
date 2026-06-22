import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { findVisibleVenueByIdOrPlaceId } from "@/lib/venueLookup";
import { PageTransition } from "@/components/PageTransition";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "./VenuePageClient";

const siteUrl = "https://night-vibe-checker.vercel.app";
const defaultOgImage = "/og-default.png";
const genericMetadata: Metadata = {
  title: {
    absolute: "NightVibe",
  },
  description: "Find the hottest spots in Charlotte tonight",
  openGraph: {
    title: "NightVibe",
    description: "Find the hottest spots in Charlotte tonight",
    images: [defaultOgImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "NightVibe",
    description: "Find the hottest spots in Charlotte tonight",
    images: [defaultOgImage],
  },
};

type VenueMetadataRow = {
  name: string;
  description: string | null;
  neighborhood: string | null;
  vibeScore: number | null;
  photos: string[];
};

export const dynamic = "force-dynamic";

type VenuePageProps = {
  params: Promise<{ id: string }>;
};

function getVenuePublicUrl(venue: ConsumerVenue): string {
  return `${siteUrl}/venues/${encodeURIComponent(venue.id)}`;
}

function getVenueOgImage(venue: ConsumerVenue): string | undefined {
  return venue.photoUrls?.[0] ?? venue.photoUrl;
}

function mapPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function mapVenueMetadataRow(row: Record<string, unknown>): VenueMetadataRow {
  const photoUrl = typeof row.photo_url === "string" && row.photo_url.length > 0 ? row.photo_url : null;
  const photoUrls = mapPhotoUrls(row.photo_urls);

  return {
    name: String(row.name ?? "NightVibe"),
    description: typeof row.editorial_summary === "string" ? row.editorial_summary : null,
    neighborhood: typeof row.neighborhood === "string" ? row.neighborhood : null,
    vibeScore: row.avg_vibe_score == null ? null : Number(row.avg_vibe_score),
    photos: photoUrl ? [photoUrl, ...photoUrls] : photoUrls,
  };
}

async function getVenueMetadataRow(id: string): Promise<VenueMetadataRow | null> {
  const result = await findVisibleVenueByIdOrPlaceId(
    id,
    "name, editorial_summary, neighborhood, avg_vibe_score, photo_url, photo_urls, hidden"
  );

  if (result.error || !result.data) return null;
  return mapVenueMetadataRow(result.data);
}

function formatVibeScore(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "unavailable";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function getVenueMetadataDescription(venue: VenueMetadataRow): string {
  const neighborhood = venue.neighborhood ?? "Charlotte";
  return `${neighborhood} · Vibe score ${formatVibeScore(venue.vibeScore)} · Check in on NightVibe`;
}

function getVenueJsonLd(venue: ConsumerVenue) {
  const url = getVenuePublicUrl(venue);
  const ratingValue = venue.rating ?? venue.googleRating;
  const image = getVenueOgImage(venue);

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    additionalType: "https://schema.org/NightClub",
    "@id": url,
    name: venue.name,
    url,
    address: venue.address,
    geo: {
      "@type": "GeoCoordinates",
      latitude: venue.lat,
      longitude: venue.lng,
    },
    ...(image ? { image } : {}),
    ...(venue.phone ? { telephone: venue.phone } : {}),
    ...(venue.website ? { sameAs: venue.website } : {}),
    ...(typeof ratingValue === "number"
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue,
            bestRating: 5,
            worstRating: 1,
            ...(typeof venue.totalRatings === "number" ? { ratingCount: venue.totalRatings } : {}),
          },
        }
      : {}),
  };
}

export async function generateMetadata({ params }: VenuePageProps): Promise<Metadata> {
  const { id } = await params;
  const venue = await getVenueMetadataRow(id);

  if (!venue) return genericMetadata;

  const title = `${venue.name} — NightVibe`;
  const description = getVenueMetadataDescription(venue);
  const image = venue.photos[0] ?? defaultOgImage;

  return {
    title: {
      absolute: title,
    },
    description,
    openGraph: {
      title,
      description,
      images: [image],
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
  const venue = await getConsumerVenueById(id);
  if (!venue) notFound();

  return (
    <>
      <link rel="canonical" href={getVenuePublicUrl(venue)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getVenueJsonLd(venue)) }}
      />
      <PageTransition>
        <VenuePageClient venueId={id} initialVenue={venue} />
      </PageTransition>
    </>
  );
}
