type NeighborhoodBounds = {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

const CHARLOTTE_NEIGHBORHOODS: NeighborhoodBounds[] = [
  { name: "South End", minLat: 35.21, maxLat: 35.23, minLng: -80.87, maxLng: -80.85 },
  { name: "Uptown", minLat: 35.22, maxLat: 35.23, minLng: -80.85, maxLng: -80.83 },
  { name: "Plaza Midwood", minLat: 35.21, maxLat: 35.22, minLng: -80.83, maxLng: -80.81 },
  { name: "NoDa", minLat: 35.24, maxLat: 35.26, minLng: -80.82, maxLng: -80.8 },
  { name: "Dilworth", minLat: 35.2, maxLat: 35.22, minLng: -80.87, maxLng: -80.85 },
  { name: "South Park", minLat: 35.13, maxLat: 35.18, minLng: -80.87, maxLng: -80.82 },
];

export function getNeighborhood(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Charlotte";

  const neighborhood = CHARLOTTE_NEIGHBORHOODS.find(
    (bounds) => lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng,
  );

  return neighborhood?.name ?? "Charlotte";
}
