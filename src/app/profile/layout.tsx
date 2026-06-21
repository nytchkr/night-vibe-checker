import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile — nytchkr",
  description:
    "View your Night Vibe profile, saved South End Charlotte venues, recent check-ins, and nightlife alert settings.",
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
