import { LAUNCH_ZONE } from "@/lib/launchZone";

export const CITIES = [
  {
    id: "south-end-clt",
    name: "South End",
    city: "Charlotte, NC",
    lat: LAUNCH_ZONE.center_lat,
    lng: LAUNCH_ZONE.center_lng,
    zoneId: "south-end-charlotte",
  },
  { id: "noda-clt", name: "NoDa", city: "Charlotte, NC", lat: 35.2396, lng: -80.8106, zoneId: "noda-charlotte" },
  { id: "uptown-clt", name: "Uptown", city: "Charlotte, NC", lat: 35.2271, lng: -80.8431, zoneId: "uptown-charlotte" },
] as const;

export type City = (typeof CITIES)[number];
export type CityId = (typeof CITIES)[number]["id"];
export const DEFAULT_CITY = CITIES[0];
