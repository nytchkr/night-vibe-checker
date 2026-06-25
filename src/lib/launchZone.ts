import { LAUNCH_ZONE as ZONE_BOUNDARY, SECOND_ZONE as SECOND_BOUNDARY } from "@/lib/zone";

export const LAUNCH_ZONE = {
  id: "south-end-charlotte",
  name: "South End",
  center_lat: ZONE_BOUNDARY.center_lat,
  center_lng: ZONE_BOUNDARY.center_lng,
  radius_m: ZONE_BOUNDARY.radius_m,
} as const;

export const DILWORTH_ZONE = {
  id: "dilworth-charlotte",
  name: "Dilworth / Myers Park",
  center_lat: SECOND_BOUNDARY.center_lat,
  center_lng: SECOND_BOUNDARY.center_lng,
  radius_m: SECOND_BOUNDARY.radius_m,
} as const;

export const LAUNCH_ZONES = [LAUNCH_ZONE, DILWORTH_ZONE] as const;

export type LaunchZone = (typeof LAUNCH_ZONES)[number];
