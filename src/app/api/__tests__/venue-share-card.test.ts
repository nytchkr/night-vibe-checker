import { describe, expect, it, vi } from "vitest";

const mockGetConsumerVenueById = vi.fn();

vi.mock("@/lib/consumerVenue", () => ({
  getConsumerVenueById: mockGetConsumerVenueById,
}));

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

function venue(busyness0To100: number | null) {
  return {
    id: "venue-1",
    placeId: "place-1",
    zoneId: "south-end",
    name: "Bar X",
    address: "100 Tryon St",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    hidden: false,
    signal: busyness0To100 == null
      ? null
      : {
          venueId: "venue-1",
          placeId: "place-1",
          busyness0To100,
          busynessSource: "forecast",
          mfRatio: null,
          confidence0To1: 0.6,
          sampleSize: 0,
          computedAt: "2026-06-22T20:00:00.000Z",
          updatedAt: "2026-06-22T20:00:00.000Z",
          lastBusynessRefresh: "2026-06-22T20:00:00.000Z",
        },
  };
}

describe("GET /api/venues/[id]/share-card", () => {
  it("returns a share URL and real busyness label", async () => {
    mockGetConsumerVenueById.mockResolvedValueOnce(venue(72));

    const { GET } = await import("../venues/[id]/share-card/route");
    const res = await GET(new Request("http://localhost/api/venues/venue-1/share-card"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      shareUrl: "https://night-vibe-checker.vercel.app/venues/venue-1?ref=share",
      text: "Bar X is Packed right now on NightVibe",
    });
  });

  it("does not fabricate a busyness label without a score", async () => {
    mockGetConsumerVenueById.mockResolvedValueOnce(venue(null));

    const { GET } = await import("../venues/[id]/share-card/route");
    const res = await GET(new Request("http://localhost/api/venues/venue-1/share-card"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.text).toBe("Bar X on NightVibe — check the vibe!");
  });

  it("returns 404 when the venue cannot be found", async () => {
    mockGetConsumerVenueById.mockResolvedValueOnce(null);

    const { GET } = await import("../venues/[id]/share-card/route");
    const res = await GET(new Request("http://localhost/api/venues/missing/share-card"), params("missing"));

    expect(res.status).toBe(404);
  });
});
