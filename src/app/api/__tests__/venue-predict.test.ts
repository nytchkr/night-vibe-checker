import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindVisibleVenueByIdOrPlaceId = vi.fn();
const mockFetchBestTimeDayRawForecast = vi.fn();
const mockFrom = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/venueLookup", async () => {
  const actual = await vi.importActual<typeof import("@/lib/venueLookup")>("@/lib/venueLookup");
  return {
    ...actual,
    findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
  };
});

vi.mock("@/lib/besttime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/besttime")>("@/lib/besttime");
  return {
    ...actual,
    fetchBestTimeDayRawForecast: mockFetchBestTimeDayRawForecast,
  };
});

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
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function request() {
  return new NextRequest("http://localhost/api/venues/venue-1/predict");
}

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

function venue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    place_id: "place-1",
    name: "Night Spot",
    address: "123 Main St",
    category: "bar",
    besttime_venue_id: "besttime-1",
    ...overrides,
  };
}

function claudeResponse(predictions: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(predictions) }],
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  global.fetch = mockFetch;
});

describe("GET /api/venues/[id]/predict", () => {
  it("returns Claude-organized predictions from real BestTime and check-in context", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({ data: venue(), error: null });
    mockFetchBestTimeDayRawForecast.mockResolvedValue({
      venueId: "besttime-1",
      dayInt: 3,
      updatedOn: "2026-06-25T10:00:00.000Z",
      hours: [
        { hour: 21, busyness: 48 },
        { hour: 22, busyness: 78 },
        { hour: 23, busyness: 91 },
      ],
    });
    mockFrom.mockReturnValue(chain({
      data: [
        { id: "c1", busyness: "packed", crowd_feel: "hyped", note: "Line moving", gender_self_report: "m", created_at: "2026-06-24T03:00:00.000Z" },
        { id: "c2", busyness: "packed", crowd_feel: "mixed", note: null, gender_self_report: "f", created_at: "2026-06-23T03:00:00.000Z" },
        { id: "c3", busyness: "moderate", crowd_feel: "balanced", note: null, gender_self_report: "m", created_at: "2026-06-22T03:00:00.000Z" },
      ],
    }));
    mockFetch.mockResolvedValue(claudeResponse({
      bestTimeToVisit: { dayOfWeek: "Thursday", hourWindow: "10pm - midnight", basis: "BestTime forecast + 3 check-in reports" },
      peakCrowdWindow: { tonight: "11pm peak", thisWeekend: "not provided" },
      vibeTrend: { direction: "up", description: "Packed reports are recent." },
      crowdProfileForecast: { malePercent: 67, basis: "based on 3 check-in reports" },
    }));

    const { GET } = await import("../venues/[id]/predict/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.dataQuality).toEqual({
      checkInCount: 3,
      hasBestTimeData: true,
      confidenceLabel: "medium",
    });
    expect(json.data.predictions.bestTimeToVisit.basis).toBe("BestTime forecast + 3 check-in reports");
    expect(json.data.predictions.peakCrowdWindow.tonight).toBe("11pm peak");
    expect(json.data.predictions.peakCrowdWindow.thisWeekend).toBeNull();
    expect(json.data.predictions.crowdProfileForecast.malePercent).toBe(67);
    expect(json.data.warning).toBeNull();
    expect(json.meta.model).toBe("claude-sonnet-4-6");

    const claudeBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const context = JSON.parse(claudeBody.messages[0].content);
    expect(context.venue).toMatchObject({ id: "venue-1", googlePlaceId: "place-1" });
    expect(context.bestTimeHourlyForecast.hours).toHaveLength(3);
    expect(context.checkInSummaries).toHaveLength(3);
  });

  it("omits BestTime-dependent and crowd profile predictions when data is insufficient", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({
      data: venue({ besttime_venue_id: null }),
      error: null,
    });
    mockFrom.mockReturnValue(chain({
      data: [
        { id: "c1", busyness: "moderate", crowd_feel: "mixed", note: null, gender_self_report: "m", created_at: "2026-06-24T03:00:00.000Z" },
        { id: "c2", busyness: "dead", crowd_feel: "chill", note: null, gender_self_report: "f", created_at: "2026-06-23T03:00:00.000Z" },
      ],
    }));
    mockFetch.mockResolvedValue(claudeResponse({
      bestTimeToVisit: { dayOfWeek: "Friday", hourWindow: "10pm - midnight", basis: "invented" },
      peakCrowdWindow: { tonight: "11pm peak", thisWeekend: "Saturday" },
      vibeTrend: { direction: "stable", description: "Only two reports." },
      crowdProfileForecast: { malePercent: 50, basis: "based on 2 check-in reports" },
    }));

    const { GET } = await import("../venues/[id]/predict/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchBestTimeDayRawForecast).not.toHaveBeenCalled();
    expect(json.data.dataQuality).toEqual({
      checkInCount: 2,
      hasBestTimeData: false,
      confidenceLabel: "insufficient",
    });
    expect(json.data.predictions.bestTimeToVisit).toBeNull();
    expect(json.data.predictions.peakCrowdWindow).toEqual({ tonight: null, thisWeekend: null });
    expect(json.data.predictions.crowdProfileForecast).toBeNull();
    expect(json.data.warning).toBe("Not enough reports yet");
  });

  it("nulls crowd profile when fewer than three check-ins include M/F data", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({ data: venue(), error: null });
    mockFetchBestTimeDayRawForecast.mockResolvedValue({
      venueId: "besttime-1",
      dayInt: 3,
      updatedOn: null,
      hours: [{ hour: 22, busyness: 80 }],
    });
    mockFrom.mockReturnValue(chain({
      data: [
        { id: "c1", busyness: "packed", crowd_feel: "hyped", note: null, gender_self_report: "m", created_at: "2026-06-24T03:00:00.000Z" },
        { id: "c2", busyness: "moderate", crowd_feel: "mixed", note: null, gender_self_report: null, created_at: "2026-06-23T03:00:00.000Z" },
        { id: "c3", busyness: "moderate", crowd_feel: "mixed", note: null, gender_self_report: null, created_at: "2026-06-22T03:00:00.000Z" },
      ],
    }));
    mockFetch.mockResolvedValue(claudeResponse({
      bestTimeToVisit: { dayOfWeek: "Thursday", hourWindow: "10pm - 11pm", basis: "BestTime forecast + 3 check-in reports" },
      peakCrowdWindow: { tonight: "10pm peak", thisWeekend: null },
      vibeTrend: { direction: "stable", description: "Mixed recent reports." },
      crowdProfileForecast: { malePercent: 100, basis: "based on 1 check-in report" },
    }));

    const { GET } = await import("../venues/[id]/predict/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.predictions.crowdProfileForecast).toBeNull();
    expect(json.data.warning).toBeNull();
  });
});
