import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { RoutePrefetch } from "@/components/RoutePrefetch";
import { ExplorePageClient } from "./ExplorePageClient";

export const metadata: Metadata = {
  title: "Explore — nytchkr",
  description:
    "Discover Charlotte restaurants, bars, lounges, and clubs with real venue photos, ratings, prices, and busyness signals.",
  alternates: {
    canonical: "/explore",
  },
};

export default function ExplorePage() {
  return (
    <PageTransition>
      <RoutePrefetch href="/map" />
      <ExplorePageClient />
    </PageTransition>
  );
}
