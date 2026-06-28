export const ONBOARDING_STORAGE_KEY = "nv_onboarded";
export const LEGACY_ONBOARDING_STORAGE_KEY = "nytchkr.onboarded";
export const PREFERRED_ZONE_STORAGE_KEY = "nv-selected-zone";
export const ONBOARDING_ZONES_STORAGE_KEY = "nv_zones";

export type OnboardingZone = {
  id: "south-end-charlotte" | "dilworth-charlotte" | "south-park-charlotte";
  name: "South End" | "Dilworth" | "South Park";
  description: string;
  spotCount: number;
  mapPreview: {
    label: string;
    route: string;
    pins: Array<{ left: string; top: string; tone: "violet" | "pink" }>;
  };
};

export const ONBOARDING_ZONES: OnboardingZone[] = [
  {
    id: "south-end-charlotte",
    name: "South End",
    description: "Rail Trail bars, breweries, and late-night staples.",
    spotCount: 18,
    mapPreview: {
      label: "Rail Trail cluster",
      route: "M 16 66 C 31 49 44 58 58 35 C 68 20 80 24 88 14",
      pins: [
        { left: "32%", top: "58%", tone: "pink" },
        { left: "55%", top: "42%", tone: "violet" },
        { left: "70%", top: "24%", tone: "pink" },
      ],
    },
  },
  {
    id: "dilworth-charlotte",
    name: "Dilworth",
    description: "Neighborhood spots near Dilworth and Myers Park.",
    spotCount: 12,
    mapPreview: {
      label: "East Boulevard loop",
      route: "M 12 42 C 28 28 42 30 55 48 C 68 66 78 55 90 38",
      pins: [
        { left: "25%", top: "41%", tone: "violet" },
        { left: "49%", top: "55%", tone: "pink" },
        { left: "78%", top: "44%", tone: "violet" },
      ],
    },
  },
  {
    id: "south-park-charlotte",
    name: "South Park",
    description: "Lounges, restaurants, and polished weekend plans.",
    spotCount: 8,
    mapPreview: {
      label: "SouthPark core",
      route: "M 18 26 C 34 18 48 22 54 40 C 60 58 76 60 88 72",
      pins: [
        { left: "30%", top: "28%", tone: "pink" },
        { left: "54%", top: "47%", tone: "violet" },
        { left: "75%", top: "67%", tone: "pink" },
      ],
    },
  },
];

export function isOnboardingZoneId(value: string | null): value is OnboardingZone["id"] {
  return ONBOARDING_ZONES.some((zone) => zone.id === value);
}

export function getOnboardingZoneById(value: string | null): OnboardingZone | null {
  return ONBOARDING_ZONES.find((zone) => zone.id === value) ?? null;
}
