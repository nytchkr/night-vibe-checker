import { describe, expect, it } from "vitest";
import { buildVenueShareClipboardText, buildVenueShareData } from "@/lib/venueShare";
import type { ConsumerVenue } from "@/types";

const baseVenue: ConsumerVenue = {
  id: "bar-x",
  placeId: "places/bar-x",
  zoneId: "south-end",
  name: "Bar X",
  address: "100 Tryon St",
  lat: 35.2123,
  lng: -80.859,
  category: "bar",
  hidden: false,
  signal: null,
};

describe("venue share data", () => {
  it("uses real signal data in the native share caption", () => {
    const shareData = buildVenueShareData({
      ...baseVenue,
      signal: {
        venueId: baseVenue.id,
        placeId: baseVenue.placeId,
        busyness0To100: 72,
        busynessSource: "crowd",
        mfRatio: 61,
        confidence0To1: 0.8,
        sampleSize: 7,
        computedAt: "2026-06-21T00:00:00.000Z",
        lastBusynessRefresh: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(shareData).toEqual({
      title: "Bar X",
      text: "Bar X is packed 🔥 right now · 61% guys (live) — NightVibe",
      url: "https://night-vibe-checker.vercel.app/venues/bar-x",
    });
  });

  it("copies the live-status caption and URL for clipboard fallback", () => {
    const shareData = buildVenueShareData({
      ...baseVenue,
      signal: {
        venueId: baseVenue.id,
        placeId: baseVenue.placeId,
        busyness0To100: 45,
        busynessSource: "forecast",
        mfRatio: null,
        confidence0To1: 0.4,
        sampleSize: 0,
        computedAt: "2026-06-21T00:00:00.000Z",
        lastBusynessRefresh: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(buildVenueShareClipboardText(shareData)).toBe(
      "Bar X is getting busy right now (forecast) — NightVibe https://night-vibe-checker.vercel.app/venues/bar-x",
    );
  });
});
