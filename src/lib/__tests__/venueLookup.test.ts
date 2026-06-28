import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSql = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, { __esModule: true });
});

vi.mock("@/lib/db", () => ({ sql: mockSql }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("venue lookup", () => {
  it("falls back from place_id to id for UUID venue detail routes", async () => {
    const venue = { id: "550813ed-720e-4f99-be22-3070ca87ad41", name: "The Station" };
    mockSql
      .mockResolvedValueOnce([]) // place_id query returns nothing
      .mockResolvedValueOnce([venue]); // id query returns venue

    const { findVisibleVenueByIdOrPlaceId } = await import("@/lib/venueLookup");
    const result = await findVisibleVenueByIdOrPlaceId(
      "550813ed-720e-4f99-be22-3070ca87ad41",
      "id, name, hidden"
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual(venue);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("does not query id for non-UUID place ids", async () => {
    const venue = { id: "venue-1", place_id: "google-place-id" };
    mockSql.mockResolvedValueOnce([venue]);

    const { findVisibleVenueByIdOrPlaceId } = await import("@/lib/venueLookup");
    const result = await findVisibleVenueByIdOrPlaceId("google-place-id", "id, place_id, hidden");

    expect(result.data).toEqual(venue);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("falls back from place_id to slug for slug venue detail routes", async () => {
    const venue = { id: "venue-1", slug: "lost-and-found" };
    mockSql
      .mockResolvedValueOnce([]) // place_id query returns nothing
      .mockResolvedValueOnce([venue]); // slug query returns venue

    const { findVisibleVenueByIdOrPlaceId } = await import("@/lib/venueLookup");
    const result = await findVisibleVenueByIdOrPlaceId("lost-and-found", "id, slug, hidden");

    expect(result.error).toBeNull();
    expect(result.data).toEqual(venue);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });
});
