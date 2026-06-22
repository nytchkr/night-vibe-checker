import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockFrom = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName}`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@/lib/supabase", () => ({
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: {
      getUser: mockGetUser,
      admin: { deleteUser: mockDeleteUser },
    },
    from: mockFrom,
  },
}));

function request(token?: string) {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockDeleteUser.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue(deleteQuery({ error: null }));
});

describe("POST /api/account/delete", () => {
  it("returns 401 without a bearer token", async () => {
    const { POST } = await import("../account/delete/route");

    const res = await POST(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Missing bearer token." });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes user-owned account data and the auth user", async () => {
    const checkInsQuery = deleteQuery({ error: null });
    const savedVenuesQuery = deleteQuery({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValueOnce(checkInsQuery).mockReturnValueOnce(savedVenuesQuery);

    const { POST } = await import("../account/delete/route");
    const res = await POST(request("access-token"));

    expect(res.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("access-token");
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(checkInsQuery.delete).toHaveBeenCalled();
    expect(checkInsQuery.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "saved_venues");
    expect(savedVenuesQuery.delete).toHaveBeenCalled();
    expect(savedVenuesQuery.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-123");
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});

function deleteQuery(result: { error: unknown }) {
  type Query = {
    delete: Mock<[], Query>;
    eq: Mock<[string, string], Promise<{ error: unknown }>>;
  };

  const query = {} as Query;
  query.delete = vi.fn(() => query);
  query.eq = vi.fn(async (_column: string, _value: string) => result);
  return query;
}
