import type { Metadata } from "next";
import VenueMapClient from "@/components/VenueMapClient";

export const metadata: Metadata = {
  title: "NightVibe - South End Charlotte",
  description:
    "Find South End Charlotte bars and clubs by live crowd level, vibe signals, and real venue data before you go out.",
};

export default function Home() {
  return <VenueMapClient />;
}
