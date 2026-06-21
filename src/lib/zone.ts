export const LAUNCH_ZONE = { center_lat: 35.2180, center_lng: -80.8500, radius_m: 2500 };

export function inZone(lat: number, lng: number): boolean {
  const R = 6371000;
  const dLat = ((lat - LAUNCH_ZONE.center_lat) * Math.PI) / 180;
  const dLng = ((lng - LAUNCH_ZONE.center_lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((LAUNCH_ZONE.center_lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= LAUNCH_ZONE.radius_m;
}
