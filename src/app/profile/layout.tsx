import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You — nytchkr",
  description: "Save your favorite South End Charlotte venues and see when they are packed.",
  alternates: {
    canonical: "/profile",
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
