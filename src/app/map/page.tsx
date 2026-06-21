import VenueMapClient from "@/components/VenueMapClient";
import { PageTransition } from "@/components/PageTransition";

export const metadata = {
  title: "Map — NightVibe",
};

export default function MapPage() {
  return (
    <PageTransition>
      <VenueMapClient />
    </PageTransition>
  );
}
