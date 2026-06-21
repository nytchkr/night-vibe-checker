import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { ExplorePageClient } from "./ExplorePageClient";

export const metadata: Metadata = {
  title: "Explore — nytchkr",
  description: "Find bars and clubs in South End Charlotte",
};

export default function ExplorePage() {
  return (
    <PageTransition>
      <ExplorePageClient />
    </PageTransition>
  );
}
