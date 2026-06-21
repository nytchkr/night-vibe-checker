import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieToken } from "@/lib/adminPasswordAuth";

const mockFrom = vi.fn();
const mockRecomputeVenueSignal = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("@/lib/signals", () => ({
  recomputeVenueSignal: mockRecomputeVenueSignal,
}));

function adminRequest(path: string, method: string, authorized = true) {
  const headers = authorized
    ? { cookie: `${ADMIN_COOKIE_NAME}=${getAdminCookieToken()}` }
    : undefined;

  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
  });
}

function chain(resolved: { data?: unknown; error?: { message: string } | null }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockRecomputeVenueSignal.mockResolvedValue({});
});

describe("admin moderation API", () => {
  it("rejects check-in deletes without the admin cookie", async () => {
    const { DELETE } = await import("../admin/check-ins/[id]/route");
    const response = await DELETE(adminRequest("/api/admin/check-ins/check-1", "DELETE", false), {
      params: Promise.resolve({ id: "check-1" }),
    });

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes a check-in with service-role writes and recomputes the venue signal", async () => {
    const existingChain = chain({ data: { venue_id: "venue-1" } });
    const deleteChain = chain({});
    mockFrom.mockReturnValueOnce(existingChain).mockReturnValueOnce(deleteChain);

    const { DELETE } = await import("../admin/check-ins/[id]/route");
    const response = await DELETE(adminRequest("/api/admin/check-ins/check-1", "DELETE"), {
      params: Promise.resolve({ id: "check-1" }),
    });

    expect(response.status).toBe(204);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "check_ins");
    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith("id", "check-1");
    expect(mockRecomputeVenueSignal).toHaveBeenCalledWith("venue-1");
  });

  it("rejects venue hides without the admin cookie", async () => {
    const { DELETE } = await import("../admin/venues/[id]/route");
    const response = await DELETE(adminRequest("/api/admin/venues/venue-1", "DELETE", false), {
      params: Promise.resolve({ id: "venue-1" }),
    });

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("hides a venue by setting hidden=true", async () => {
    const venueChain = chain({
      data: {
        id: "venue-1",
        place_id: "place-1",
        name: "Trio",
        address: "123 King St",
        category: "bar",
        hidden: true,
        last_busyness_refresh: null,
        venue_signals: { busyness_0_100: 70, sample_size: 4, last_busyness_refresh: null },
      },
    });
    mockFrom.mockReturnValueOnce(venueChain);

    const { DELETE } = await import("../admin/venues/[id]/route");
    const response = await DELETE(adminRequest("/api/admin/venues/venue-1", "DELETE"), {
      params: Promise.resolve({ id: "venue-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("venues");
    expect(venueChain.update).toHaveBeenCalledWith({ hidden: true });
    expect(venueChain.eq).toHaveBeenCalledWith("id", "venue-1");
    expect(json.venue.hidden).toBe(true);
  });
});
