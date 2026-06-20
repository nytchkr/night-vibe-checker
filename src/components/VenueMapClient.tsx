"use client";

import dynamic from "next/dynamic";

const VenueMap = dynamic(() => import("@/components/VenueMap"), { ssr: false });

export default function VenueMapClient() {
  return <VenueMap />;
}
