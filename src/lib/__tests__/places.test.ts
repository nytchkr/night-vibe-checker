import { afterEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_ZONE } from "@/lib/launchZone";
import { buildPhotoUrl, discoverZone } from "@/lib/places";

describe("Google Places discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses legacy Nearby Search for the launch zone and dedupes by place_id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith("/details/json")) {
        expect(url.searchParams.get("fields")).toBe("opening_hours,photos");
        expect(url.searchParams.get("key")).toBe("places-test-key");
        const placeId = url.searchParams.get("place_id");

        return Response.json({
          status: "OK",
          result: {
            opening_hours: {
              open_now: true,
              weekday_text: [
                "Monday: 5:00 PM – 2:00 AM",
                "Tuesday: 5:00 PM – 2:00 AM",
                "Wednesday: 5:00 PM – 2:00 AM",
                "Thursday: 5:00 PM – 2:00 AM",
                "Friday: 5:00 PM – 2:00 AM",
                "Saturday: 5:00 PM – 2:00 AM",
                "Sunday: Closed",
              ],
            },
            photos: [
              { photo_reference: `${placeId}-details-photo-reference` },
              { photo_reference: `${placeId}-details-photo-reference-2` },
              { photo_reference: `${placeId}-details-photo-reference-3` },
              { photo_reference: `${placeId}-details-photo-reference-4` },
            ],
          },
        });
      }

      const type = url.searchParams.get("type");

      expect(url.toString()).toContain("/nearbysearch/json");
      expect(url.searchParams.get("location")).toBe("35.218,-80.85");
      expect(url.searchParams.get("radius")).toBe("2500");
      expect(url.searchParams.get("key")).toBe("places-test-key");

      return Response.json({
        status: "OK",
        results: [
          {
            place_id: type === "bar" ? "place-1" : `place-${type}`,
            name: `${type} venue`,
            vicinity: "100 Tryon St",
            geometry: { location: { lat: 35.218, lng: -80.85 } },
            rating: 4.5,
            user_ratings_total: 123,
            price_level: 2,
            photos: [
              { photo_reference: `${type}-photo-reference` },
              { photo_reference: `${type}-photo-reference-2` },
              { photo_reference: `${type}-photo-reference-3` },
              { photo_reference: `${type}-photo-reference-4` },
            ],
          },
          {
            place_id: "place-1",
            name: "Duplicate venue",
            vicinity: "Duplicate address",
            geometry: { location: { lat: 35.219, lng: -80.851 } },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const venues = await discoverZone(LAUNCH_ZONE);
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input.toString()));
    const nearbyUrls = urls.filter((url) => url.pathname.endsWith("/nearbysearch/json"));
    const detailUrls = urls.filter((url) => url.pathname.endsWith("/details/json"));

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(nearbyUrls.map((url) => url.searchParams.get("type"))).toEqual([
      "bar",
      "night_club",
      "restaurant",
    ]);
    expect(urls.every((url) => url.hostname === "maps.googleapis.com")).toBe(true);
    expect(detailUrls.map((url) => url.searchParams.get("place_id"))).toEqual([
      "place-1",
      "place-night_club",
      "place-restaurant",
    ]);
    expect(venues.map((venue) => venue.placeId)).toEqual([
      "place-1",
      "place-night_club",
      "place-restaurant",
    ]);
    expect(venues[0]).toMatchObject({
      name: "bar venue",
      address: "100 Tryon St",
      lat: 35.218,
      lng: -80.85,
      category: "bar",
      googleRating: 4.5,
      totalRatings: 123,
      priceLevel: 2,
      photoReference: "place-1-details-photo-reference",
      photoUrl:
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=place-1-details-photo-reference&key=places-test-key",
      photoUrls: [
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=place-1-details-photo-reference&key=places-test-key",
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=place-1-details-photo-reference-2&key=places-test-key",
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=place-1-details-photo-reference-3&key=places-test-key",
      ],
      openingHours: [
        "Monday: 5:00 PM – 2:00 AM",
        "Tuesday: 5:00 PM – 2:00 AM",
        "Wednesday: 5:00 PM – 2:00 AM",
        "Thursday: 5:00 PM – 2:00 AM",
        "Friday: 5:00 PM – 2:00 AM",
        "Saturday: 5:00 PM – 2:00 AM",
        "Sunday: Closed",
      ],
      openNow: true,
    });
  });

  it("builds real Google Place Photo URLs from photo references", () => {
    expect(buildPhotoUrl("photo-ref")).toBe(
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref&key=places-test-key"
    );
  });
});
