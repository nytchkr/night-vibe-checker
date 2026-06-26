import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("venue lookup", () => {
  it("falls back from place_id to id for UUID venue detail routes", async () => {
    const placeIdQuery = chain({ data: [] });
    const idQuery = chain({ data: [{ id: "550813ed-720e-4f99-be22-3070ca87ad41", name: "The Station" }] });
    mockFrom.mockReturnValueOnce(placeIdQuery).mockReturnValueOnce(idQuery);

    const { findVisibleVenueByIdOrPlaceId } = await import("@/lib/venueLookup");
    const result = await findVisibleVenueByIdOrPlaceId(
      "550813ed-720e-4f99-be22-3070ca87ad41",
      "id, name, hidden"
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: "550813ed-720e-4f99-be22-3070ca87ad41", name: "The Station" });
    expect(placeIdQuery.eq).toHaveBeenNthCalledWith(1, "place_id", "550813ed-720e-4f99-be22-3070ca87ad41");
    expect(idQuery.eq).toHaveBeenNthCalledWith(1, "id", "550813ed-720e-4f99-be22-3070ca87ad41");
  });

  it("does not query id for non-UUID place ids", async () => {
    const placeIdQuery = chain({ data: [{ id: "venue-1", place_id: "google-place-id" }] });
    mockFrom.mockReturnValueOnce(placeIdQuery);

    const { findVisibleVenueByIdOrPlaceId } = await import("@/lib/venueLookup");
    const result = await findVisibleVenueByIdOrPlaceId("google-place-id", "id, place_id, hidden");

    expect(result.data).toEqual({ id: "venue-1", place_id: "google-place-id" });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(placeIdQuery.eq).toHaveBeenNthCalledWith(1, "place_id", "google-place-id");
  });
});
