export const LAUNCH_ZONE = { center_lat: 35.2123, center_lng: -80.8590, radius_m: 2500 };

export const SECOND_ZONE = { center_lat: 35.2040, center_lng: -80.8440, radius_m: 2500 };

export const SOUTH_PARK_ZONE = { center_lat: 35.1524, center_lng: -80.8462, radius_m: 2500 };

export const ALL_ZONES = [LAUNCH_ZONE, SECOND_ZONE, SOUTH_PARK_ZONE];

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function inZone(lat: number, lng: number): boolean {
  return ALL_ZONES.some((zone) => distanceM(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_m);
}

export const inAnyZone = inZone;
