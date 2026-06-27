import type { Metadata } from "next";
import { LazyVenueMapClient } from "@/components/LazyVenueMapClient";

export const metadata: Metadata = {
  title: "NightVibe - South End Charlotte",
  description:
    "Find South End Charlotte bars and clubs by live crowd level, vibe signals, and real venue data before you go out.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <LazyVenueMapClient />;
}
