import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { RoutePrefetch } from "@/components/RoutePrefetch";
import { ExplorePageClient } from "./ExplorePageClient";

export const metadata: Metadata = {
  title: "Explore — nytchkr",
  description:
    "Discover South End Charlotte bars and clubs. See live crowd levels and find your vibe before you go.",
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
