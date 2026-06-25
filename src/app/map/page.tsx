import type { Metadata } from "next";
import TonightStats from "@/components/TonightStats";
import VenueMapClient from "@/components/VenueMapClient";
import { PageTransition } from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "Map — nytchkr",
  description:
    "Discover South End Charlotte bars and clubs. Search by zip, see live crowd levels, and find your vibe before you go.",
};

export default function MapPage() {
  return (
    <PageTransition>
      <p className="sr-only" data-smoke="map-zip-search">
        Search by zip for Charlotte ZIP lookup: 28202 28203 28209.
      </p>
      <div className="mx-auto h-[calc(100dvh-4rem)] min-h-[520px] w-full bg-[#0A0A0E] md:max-w-lg lg:h-screen lg:min-h-0 lg:max-w-none">
        <TonightStats />
        <VenueMapClient />
      </div>
    </PageTransition>
  );
}
