import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You — nytchkr",
  description:
    "View your nytchkr check-ins, saved South End Charlotte venues, and nightlife alert settings.",
  alternates: {
    canonical: "/profile",
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
