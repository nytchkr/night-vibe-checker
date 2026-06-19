export const LAUNCH_ZONE = {
  id: "south-end-charlotte",
  name: "South End, Charlotte",
  center_lat: 35.2123,
  center_lng: -80.859,
  radius_m: 1500,
} as const;

export type LaunchZone = typeof LAUNCH_ZONE;
