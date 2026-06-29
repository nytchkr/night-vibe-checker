import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { RoutePrefetch } from "@/components/RoutePrefetch";
import { LazyVenueMapClient } from "@/components/LazyVenueMapClient";

export const metadata: Metadata = {
  title: "Map — nytchkr",
  description:
    "Discover busyness-colored bars and clubs in the Uptown and South End Charlotte launch zone.",
  alternates: {
    canonical: "/map",
  },
};

export default function MapPage() {
  return (
    <PageTransition>
      <RoutePrefetch href="/explore" />
      <p className="sr-only" data-smoke="map-zip-search">
        Search by zip for Charlotte ZIP lookup: 28202 28203 28209. Launch zone center 35.218, -80.850.
      </p>
      <div className="mx-auto w-full bg-[#0A0A0E] md:max-w-lg lg:max-w-none">
        <LazyVenueMapClient />
      </div>
    </PageTransition>
  );
}
