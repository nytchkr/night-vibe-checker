"use client";

import dynamic from "next/dynamic";
import { MapLoadingSkeleton } from "@/components/MapLoadingSkeleton";

const VenueMapClient = dynamic(() => import("@/components/VenueMapClient"), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

export function LazyVenueMapClient() {
  return <VenueMapClient />;
}
