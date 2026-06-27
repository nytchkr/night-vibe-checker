import type { Metadata } from "next";
import TonightStats from "@/components/TonightStats";
import VenueMapClient from "@/components/VenueMapClient";
import { PageTransition } from "@/components/PageTransition";
import { RoutePrefetch } from "@/components/RoutePrefetch";

export const metadata: Metadata = {
  title: "Map — nytchkr",
  description:
    "Discover South End Charlotte bars and clubs. Search by zip, see live crowd levels, and find your vibe before you go.",
  alternates: {
    canonical: "/map",
  },
};

export default function MapPage() {
  return (
    <PageTransition>
      <RoutePrefetch href="/explore" />
      <p className="sr-only" data-smoke="map-zip-search">
        Search by zip for Charlotte ZIP lookup: 28202 28203 28209.
      </p>
      <div className="mx-auto w-full bg-[#0A0A0E] md:max-w-lg lg:max-w-none">
        <TonightStats />
        <VenueMapClient />
      </div>
    </PageTransition>
  );
}
