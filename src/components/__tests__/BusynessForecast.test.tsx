// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusynessForecast } from "@/components/BusynessForecast";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(hours: Array<{ hour: number; busyness: number }>) {
  return new Response(JSON.stringify({ hours }), { status: 200 });
}

describe("BusynessForecast", () => {
  it("renders hourly bars and highlights the current hour", async () => {
    const currentHour = new Date().getHours();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(
      Array.from({ length: 24 }, (_, hour) => ({ hour, busyness: hour === currentHour ? 88 : 20 }))
    )));

    render(<BusynessForecast venueId="venue-1" />);

    await waitFor(() => expect(screen.getByLabelText(`Hour ${currentHour}: 88% busy current hour`)).toBeTruthy());
    expect(screen.getByText("Hourly forecast")).toBeTruthy();
    if (currentHour > 0) {
      expect(screen.getByLabelText(`Hour ${currentHour - 1}: 20% busy`).style.opacity).toBe("0.3");
    }
    expect(screen.getByLabelText(`Hour ${currentHour}: 88% busy current hour`).className).toContain("bg-[#8B6CFF]");
  });

  it("shows an unavailable state for empty forecasts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));

    render(<BusynessForecast venueId="venue-1" />);

    await waitFor(() => expect(screen.getByText("Forecast not available")).toBeTruthy());
  });
});
