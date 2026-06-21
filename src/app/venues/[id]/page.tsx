import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { PageTransition } from "@/components/PageTransition";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "./VenuePageClient";

const siteUrl = "https://night-vibe-checker.vercel.app";
const fallbackTitle = "NightVibe — South End Charlotte";
const fallbackDescription = "See how busy South End bars and clubs are right now. Real-time crowd vibes.";
const fallbackImage = "/og-image.png";

export const dynamic = "force-dynamic";

type VenuePageProps = {
  params: Promise<{ id: string }>;
};

function getVenueDescription(venue: ConsumerVenue): string {
  const busyness = venue.signal?.busyness0To100;
  if (typeof busyness === "number") {
    return `${venue.name} is currently ${Math.round(busyness)}/100 busy in South End Charlotte. See who's out tonight on NightVibe.`;
  }

  return `See the live crowd vibe at ${venue.name} in South End Charlotte.`;
}

export async function generateMetadata({ params }: VenuePageProps): Promise<Metadata> {
  const { id } = await params;
  const venue = await getConsumerVenueById(id);
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
  const venue = await getConsumerVenueById(id);
  if (!venue) notFound();

  return (
    <>
      <link rel="canonical" href={`${siteUrl}/venues/${venue.id}`} />
      <PageTransition>
        <VenuePageClient venueId={id} initialVenue={venue} />
      </PageTransition>
    </>
  );
}
