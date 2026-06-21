import type { Metadata } from "next";
import VenueMapClient from "@/components/VenueMapClient";
import { PageTransition } from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "NightVibe — Live Nightlife Map",
  description: "Real-time busyness for South End Charlotte bars and clubs. Know before you go.",
};

export default function MapPage() {
  return (
    <PageTransition>
      <VenueMapClient />
    </PageTransition>
  );
}
