import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

const mockCookieGetUser = vi.fn();
const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockCookieGetUser },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: { getUser: mockAdminGetUser },
    from: mockFrom,
  },
}));

function request(method = "GET", body?: unknown, token?: string) {
  return new NextRequest("http://localhost/api/saved-venues", {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockCookieGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no cookie" } });
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
});

describe("/api/saved-venues", () => {
  it("returns 401 without an authenticated user", async () => {
    const { GET } = await import("../saved-venues/route");

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns saved venue text IDs ordered by created_at", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const query = savedVenueSelectQuery({
      data: [{ venue_id: "google-place-text-id" }, { venue_id: "uuid-or-slug-id" }],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../saved-venues/route");
    const res = await GET(request("GET", undefined, "token"));

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("saved_venues");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    await expect(res.json()).resolves.toMatchObject({
      status: "success",
      place_ids: ["google-place-text-id", "uuid-or-slug-id"],
      venueIds: ["google-place-text-id", "uuid-or-slug-id"],
      data: { savedVenueIds: ["google-place-text-id", "uuid-or-slug-id"] },
    });
  });

  it("saves a non-UUID place_id for the authenticated user", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const upsert = vi.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue({ upsert });

    const { POST } = await import("../saved-venues/route");
    const res = await POST(request("POST", { place_id: "place_text_123" }, "token"));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-123", venue_id: "place_text_123" },
      { onConflict: "user_id,venue_id" },
    );
    await expect(res.json()).resolves.toMatchObject({
      status: "success",
      ok: true,
      venueId: "place_text_123",
      saved: true,
    });
  });

  it("still accepts legacy venueId bodies", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const upsert = vi.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue({ upsert });

    const { POST } = await import("../saved-venues/route");
    const res = await POST(request("POST", { venueId: "legacy-id" }, "token"));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-123", venue_id: "legacy-id" },
      { onConflict: "user_id,venue_id" },
    );
  });
});

function savedVenueSelectQuery(result: { data: unknown; error: unknown }) {
  type Query = {
    select: Mock<[], Query>;
    eq: Mock<[], Query>;
    order: Mock<[string, { ascending: boolean }], Promise<{ data: unknown; error: unknown }>>;
  };

  const query = {} as Query;
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(async (_column: string, _options: { ascending: boolean }) => result);
  return query;
}
