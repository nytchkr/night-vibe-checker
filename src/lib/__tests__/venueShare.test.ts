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
        busynessSource: "live",
        confidence0To1: 0.8,
        computedAt: "2026-06-21T00:00:00.000Z",
        lastBusynessRefresh: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(shareData).toEqual({
      title: "Bar X on nytchkr",
      text: "Check out Bar X on nytchkr: packed right now. https://nytchkr.com/venues/bar-x",
      url: "https://nytchkr.com/venues/bar-x",
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
        confidence0To1: 0.4,
        computedAt: "2026-06-21T00:00:00.000Z",
        lastBusynessRefresh: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(buildVenueShareClipboardText(shareData)).toBe(
      "Check out Bar X on nytchkr: moderate right now. https://nytchkr.com/venues/bar-x",
    );
  });

  it("does not include crowd split language", () => {
    const shareData = buildVenueShareData({
      ...baseVenue,
      signal: {
        venueId: baseVenue.id,
        placeId: baseVenue.placeId,
        busyness0To100: 72,
        busynessSource: "live",
        confidence0To1: 0.5,
        computedAt: "2026-06-21T00:00:00.000Z",
        lastBusynessRefresh: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(shareData.text).toBe("Check out Bar X on nytchkr: packed right now. https://nytchkr.com/venues/bar-x");
  });

  it("does not invent a packed percentage when no signal is available", () => {
    expect(buildVenueShareData(baseVenue)).toEqual({
      title: "Bar X on nytchkr",
      text: "Check out Bar X on nytchkr: busyness data is not available yet. https://nytchkr.com/venues/bar-x",
      url: "https://nytchkr.com/venues/bar-x",
    });
  });
});
