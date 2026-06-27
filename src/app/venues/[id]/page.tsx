import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { getNeighborhood } from "@/lib/neighborhood";
import { DEFAULT_OG_IMAGE_PATH, absoluteUrl, getVenuePublicUrl } from "@/lib/seo";
import { findVisibleVenueByIdOrPlaceId } from "@/lib/venueLookup";
import { PageTransition } from "@/components/PageTransition";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "./VenuePageClient";

const genericMetadata: Metadata = {
  title: {
    absolute: "NightVibe",
  },
  description: "Find the hottest spots in Charlotte tonight",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "NightVibe",
    description: "Find the hottest spots in Charlotte tonight",
    images: [DEFAULT_OG_IMAGE_PATH],
  },
  twitter: {
    card: "summary_large_image",
    title: "NightVibe",
    description: "Find the hottest spots in Charlotte tonight",
    images: [DEFAULT_OG_IMAGE_PATH],
  },
};

type VenueMetadataRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  photos: string[];
};

export const dynamic = "force-dynamic";

type VenuePageProps = {
  params: Promise<{ id: string }>;
};

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
    id: String(row.id ?? ""),
    slug: typeof row.slug === "string" && row.slug.length > 0 ? row.slug : null,
    name: String(row.name ?? "NightVibe"),
    description: typeof row.editorial_summary === "string" ? row.editorial_summary : null,
    neighborhood: typeof row.neighborhood === "string" ? row.neighborhood : null,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    photos: photoUrl ? [photoUrl, ...photoUrls] : photoUrls,
  };
}

async function getVenueMetadataRow(id: string): Promise<VenueMetadataRow | null> {
  const result = await findVisibleVenueByIdOrPlaceId(
    id,
    "id, slug, name, editorial_summary, neighborhood, lat, lng, photo_url, photo_urls, hidden"
  );

  if (result.error || !result.data) return null;
  return mapVenueMetadataRow(result.data);
}

function getMetadataNeighborhood(venue: VenueMetadataRow): string {
  if (venue.neighborhood) return venue.neighborhood;
  if (venue.lat != null && venue.lng != null) return getNeighborhood(venue.lat, venue.lng);
  return "Charlotte";
}

function getVenueMetadataDescription(venue: VenueMetadataRow): string {
  return `${venue.name} in ${getMetadataNeighborhood(venue)} — see how busy it is tonight`;
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
    category: venue.category,
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

  const title = `${venue.name} | NightVibe Charlotte`;
  const description = getVenueMetadataDescription(venue);
  const image = venue.photos[0] ?? DEFAULT_OG_IMAGE_PATH;
  const canonical = getVenuePublicUrl({ id: venue.id, slug: venue.slug ?? undefined });

  return {
    title: {
      absolute: title,
    },
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [absoluteUrl(image)],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(image)],
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
