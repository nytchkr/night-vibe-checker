export const LAUNCH_ZONE = {
  id: "south-end-charlotte",
  name: "South End",
  center_lat: 35.2178,
  center_lng: -80.8597,
  radius_m: 1500,
} as const;

export type LaunchZone = typeof LAUNCH_ZONE;
