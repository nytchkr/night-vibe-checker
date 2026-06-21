import { LAUNCH_ZONE as ZONE_BOUNDARY } from "@/lib/zone";

export const LAUNCH_ZONE = {
  id: "south-end-charlotte",
  name: "South End",
  center_lat: ZONE_BOUNDARY.center_lat,
  center_lng: ZONE_BOUNDARY.center_lng,
  radius_m: ZONE_BOUNDARY.radius_m,
} as const;

export type LaunchZone = typeof LAUNCH_ZONE;
