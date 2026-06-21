import type { Metadata } from "next";
import VenueMapClient from "@/components/VenueMapClient";
import { PageTransition } from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "Map — nytchkr",
  description:
    "Discover South End Charlotte bars and clubs. See live crowd levels and find your vibe before you go.",
};

export default function MapPage() {
  return (
    <PageTransition>
      <VenueMapClient />
    </PageTransition>
  );
}
