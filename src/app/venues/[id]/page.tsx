import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { PageTransition } from "@/components/PageTransition";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "./VenuePageClient";

const siteUrl = "https://night-vibe-checker.vercel.app";

export const dynamic = "force-dynamic";

type VenuePageProps = {
  params: Promise<{ id: string }>;
};

function getVenueDescription(venue: ConsumerVenue): string {
  const busynessText = getBusynessText(venue);
  return `${busynessText}. ${venue.address ?? "South End Charlotte"}. Check the vibe before you go.`;
}

function getBusynessText(venue: ConsumerVenue): string {
  const busyness = venue.signal?.busyness0To100;
  return typeof busyness === "number"
    ? `${Math.round(busyness)}% busy right now`
    : "Live busyness data";
}

function getVenueJsonLd(venue: ConsumerVenue) {
  const url = `${siteUrl}/venues/${encodeURIComponent(venue.id)}`;
  const ratingValue = venue.rating ?? venue.googleRating;

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
    ...(venue.photoUrl ? { image: venue.photoUrl } : {}),
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
  const venue = await getConsumerVenueById(id);

  if (!venue) return { title: "NightVibe" };

  const busynessText = getBusynessText(venue);
  const title = `${venue.name} — NightVibe`;

  return {
    title,
    description: getVenueDescription(venue),
    openGraph: {
      title: `${venue.name} — Live Vibe Check`,
      description: busynessText,
      url: `${siteUrl}/venues/${encodeURIComponent(venue.id)}`,
      images: venue.photoUrl
        ? [{ url: venue.photoUrl, width: 1200, height: 630 }]
        : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: busynessText,
    },
  };
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { id } = await params;
  const venue = await getConsumerVenueById(id);
  if (!venue) notFound();

  return (
    <>
      <link rel="canonical" href={`${siteUrl}/venues/${venue.id}`} />
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
