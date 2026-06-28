import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "nytchkr - Find your spot tonight",
  description:
    "Find where to eat or hang out in Charlotte tonight with real busyness and real vibes in South End.",
  alternates: {
    canonical: "/explore",
  },
};

export default function Home() {
  redirect("/explore");
}
