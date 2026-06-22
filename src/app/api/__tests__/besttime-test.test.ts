import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieToken } from "@/lib/adminPasswordAuth";

function request(authorized = true) {
  return new NextRequest("http://localhost/api/admin/besttime-test", {
    method: "GET",
    headers: authorized ? { cookie: `${ADMIN_COOKIE_NAME}=${getAdminCookieToken()}` } : undefined,
  });
}

describe("GET /api/admin/besttime-test", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    process.env.ADMIN_PASSWORD = "admin-secret";
    process.env.BESTTIME_API_KEY = "besttime-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ADMIN_PASSWORD;
    delete process.env.BESTTIME_API_KEY;
  });

  it("requires the admin session cookie", async () => {
    const { GET } = await import("../admin/besttime-test/route");
    const response = await GET(request(false));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the BestTime forecast API for the hardcoded test venue", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "OK",
          venue_info: { venue_id: "bt-venue-1" },
          analysis: [{ day_info: { day_text: "Sunday" } }],
        }),
        { status: 200 }
      )
    );

    const { GET } = await import("../admin/besttime-test/route");
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("https://besttime.app/api/v1/forecasts?");
    expect(String(url)).toContain("api_key_private=besttime-secret");
    expect(String(url)).toContain("venue_name=Butter+NC");
    expect(String(url)).toContain("venue_address=Charlotte%2C+NC");
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(json).toEqual({
      status: "success",
      venue: { name: "Butter NC", address: "Charlotte, NC" },
      bestTimeStatus: 200,
      data: {
        status: "OK",
        venue_info: { venue_id: "bt-venue-1" },
        analysis: [{ day_info: { day_text: "Sunday" } }],
      },
    });
  });

  it("does not expose the BestTime key in the response body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "OK", api_key_private: "besttime-secret" }), { status: 200 })
    );

    const { GET } = await import("../admin/besttime-test/route");
    const response = await GET(request());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("besttime-secret");
    expect(JSON.parse(text).data).toEqual({ status: "OK" });
  });
});
