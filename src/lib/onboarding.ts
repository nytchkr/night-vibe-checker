export const ONBOARDING_STORAGE_KEY = "nv_onboarded";
export const LEGACY_ONBOARDING_STORAGE_KEY = "nightvibe.onboarded";
export const PREFERRED_ZONE_STORAGE_KEY = "nv_preferred_zone";

export type OnboardingZone = {
  id: "south-end-charlotte" | "dilworth-charlotte" | "south-park-charlotte";
  name: "South End" | "Dilworth" | "South Park";
  description: string;
  spotCount: number;
};

export const ONBOARDING_ZONES: OnboardingZone[] = [
  {
    id: "south-end-charlotte",
    name: "South End",
    description: "Rail Trail bars, breweries, and late-night staples.",
    spotCount: 18,
  },
  {
    id: "dilworth-charlotte",
    name: "Dilworth",
    description: "Neighborhood spots near Dilworth and Myers Park.",
    spotCount: 12,
  },
  {
    id: "south-park-charlotte",
    name: "South Park",
    description: "Lounges, restaurants, and polished weekend plans.",
    spotCount: 8,
  },
];

export function isOnboardingZoneId(value: string | null): value is OnboardingZone["id"] {
  return ONBOARDING_ZONES.some((zone) => zone.id === value);
}

export function getOnboardingZoneById(value: string | null): OnboardingZone | null {
  return ONBOARDING_ZONES.find((zone) => zone.id === value) ?? null;
}
