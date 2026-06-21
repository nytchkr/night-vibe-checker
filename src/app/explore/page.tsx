import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { ExplorePageClient } from "./ExplorePageClient";

export const metadata: Metadata = {
  title: "Explore — nytchkr",
  description:
    "Discover South End Charlotte bars and clubs. See live crowd levels and find your vibe before you go.",
};

export default function ExplorePage() {
  return (
    <PageTransition>
      <ExplorePageClient />
    </PageTransition>
  );
}
