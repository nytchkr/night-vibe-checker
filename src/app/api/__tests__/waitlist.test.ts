import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function selectChain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });

  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnValue(promise),
  };
}

function insertChain(resolved: { error?: unknown }) {
  const promise = Promise.resolve({
    data: null,
    error: resolved.error ?? null,
  });

  return {
    insert: vi.fn().mockReturnValue(promise),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
});

describe("POST /api/waitlist", () => {
  it("validates email server-side", async () => {
    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid email.");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 409 when email is already on the waitlist", async () => {
    const existingChain = selectChain({ data: { email: "fan@example.com" } });
    mockFrom.mockReturnValueOnce(existingChain);

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "Fan@Example.com" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Already on the list!");
    expect(existingChain.eq).toHaveBeenCalledWith("email", "fan@example.com");
  });

  it("inserts a normalized email", async () => {
    const existingChain = selectChain({});
    const createdChain = insertChain({});
    mockFrom.mockReturnValueOnce(existingChain).mockReturnValueOnce(createdChain);

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: " Fan@Example.com " }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "waitlist");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "waitlist");
    expect(createdChain.insert).toHaveBeenCalledWith({ email: "fan@example.com" });
  });

  it("maps unique constraint races to 409", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({}))
      .mockReturnValueOnce(insertChain({ error: { code: "23505", message: "duplicate key" } }));

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "fan@example.com" }));

    expect(res.status).toBe(409);
  });
});
