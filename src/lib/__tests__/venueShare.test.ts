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
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(shareData).toEqual({
      title: "Bar X on nytchkr",
      text: "Check out Bar X on nytchkr — Packed right now",
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
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(buildVenueShareClipboardText(shareData)).toBe(
      "Check out Bar X on nytchkr — Moderate right now https://night-vibe-checker.vercel.app/venues/bar-x",
    );
  });

  it("does not invent a packed percentage when no signal is available", () => {
    expect(buildVenueShareData(baseVenue)).toEqual({
      title: "Bar X on nytchkr",
      text: "Check out Bar X on nytchkr",
      url: "https://night-vibe-checker.vercel.app/venues/bar-x",
    });
  });
});
