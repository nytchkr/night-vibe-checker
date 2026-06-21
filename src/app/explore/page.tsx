import { PageTransition } from "@/components/PageTransition";
import { ExplorePageClient } from "./ExplorePageClient";

export const metadata = {
  title: "Explore — NightVibe",
  description: "Find bars and clubs in South End Charlotte",
};

export default function ExplorePage() {
  return (
    <PageTransition>
      <ExplorePageClient />
    </PageTransition>
  );
}
