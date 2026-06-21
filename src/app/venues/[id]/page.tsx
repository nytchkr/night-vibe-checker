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

function getVenuePublicUrl(venue: ConsumerVenue): string {
  return `${siteUrl}/venue/${encodeURIComponent(venue.placeId)}`;
}

function getVenueOgImage(venue: ConsumerVenue): string | undefined {
  return venue.photoUrls?.[0] ?? venue.photoUrl;
}

function getVenueDescription(venue: ConsumerVenue): string {
  const parts = [getBusynessText(venue)];
  const ratioText = getCrowdRatioText(venue);
  if (ratioText) parts.push(ratioText);
  return parts.join(" · ");
}

function getBusynessText(venue: ConsumerVenue): string {
  const busyness = venue.signal?.busyness0To100;
  if (typeof busyness !== "number") return "Live busyness unavailable";
  if (busyness >= 67) return "Packed right now";
  if (busyness >= 34) return "Moderate right now";
  return "Quiet right now";
}

function getCrowdRatioText(venue: ConsumerVenue): string | null {
  const mfRatio = venue.signal?.mfRatio;
  if (typeof mfRatio !== "number") return null;

  const malePercent = Math.min(100, Math.max(0, Math.round(mfRatio)));
  const womenPercent = 100 - malePercent;
  if (malePercent === womenPercent) return "Balanced crowd";
  return womenPercent > malePercent ? `${womenPercent}% women` : `${malePercent}% men`;
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
  const venue = await getConsumerVenueById(id);

  if (!venue) return { title: "NightVibe" };

  const title = `${venue.name} | NightVibe`;
  const description = getVenueDescription(venue);
  const url = getVenuePublicUrl(venue);
  const image = getVenueOgImage(venue);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image, width: 1200, height: 630 }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
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
