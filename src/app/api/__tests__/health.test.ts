import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

function countQuery(count: number) {
  const promise = Promise.resolve({ count, error: null });
  return {
    select: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function rowsQuery(data: unknown[]) {
  const promise = Promise.resolve({ data, error: null });
  return {
    select: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function venueRow(lastBusynessRefresh: string) {
  return {
    open_now: true,
    venue_signals: { last_busyness_refresh: lastBusynessRefresh },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-22T03:44:23.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("keeps daily BestTime cache refreshes healthy within the grace window", async () => {
    mockFrom
      .mockReturnValueOnce(countQuery(100))
      .mockReturnValueOnce(countQuery(100))
      .mockReturnValueOnce(rowsQuery([
        venueRow("2026-06-21T14:18:32.113Z"),
        venueRow("2026-06-21T14:21:27.265Z"),
      ]));

    const { GET } = await import("../health/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.venue_count).toBe(100);
    expect(json.signals_count).toBe(100);
    expect(json.openNowCount).toBe(2);
    expect(json.staleSince).toBeNull();
    expect(json.lastBusynessRefresh).toBe("2026-06-21T14:21:27.265Z");
  });

  it("degrades when a full daily busyness refresh is missed", async () => {
    mockFrom
      .mockReturnValueOnce(countQuery(100))
      .mockReturnValueOnce(countQuery(100))
      .mockReturnValueOnce(rowsQuery([
        venueRow("2026-06-20T20:00:00.000Z"),
        venueRow("2026-06-21T14:21:27.265Z"),
      ]));

    const { GET } = await import("../health/route");
    const res = await GET();
    const json = await res.json();

    expect(json.status).toBe("degraded");
    expect(json.staleSince).toBe("2026-06-20T20:00:00.000Z");
  });

  it("degrades when signal coverage drops below eighty percent", async () => {
    mockFrom
      .mockReturnValueOnce(countQuery(100))
      .mockReturnValueOnce(countQuery(79))
      .mockReturnValueOnce(rowsQuery([venueRow("2026-06-21T14:21:27.265Z")]));

    const { GET } = await import("../health/route");
    const res = await GET();
    const json = await res.json();

    expect(json.status).toBe("degraded");
    expect(json.staleSince).toBeNull();
  });
});
