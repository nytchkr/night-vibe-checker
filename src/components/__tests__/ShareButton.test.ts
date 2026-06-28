import { describe, expect, it, vi } from "vitest";
import {
  buildVenueShareClipboardText,
  createVenueShareData,
  trackVenueShareEvent,
} from "@/components/ShareButton";

describe("ShareButton helpers", () => {
  it("creates native share data from the current page URL", () => {
    expect(createVenueShareData("Test Bar", "https://nytchkr.com/venues/test-bar")).toEqual({
      title: "Test Bar",
      text: "Check out Test Bar on nytchkr.",
      url: "https://nytchkr.com/venues/test-bar",
    });
  });

  it("copies only the URL for clipboard fallback", () => {
    expect(
      buildVenueShareClipboardText({
        title: "Test Bar",
        text: "Check out Test Bar on nytchkr.",
        url: "https://nytchkr.com/venues/test-bar",
      }),
    ).toBe("https://nytchkr.com/venues/test-bar");
  });

  it("tracks venue share events without an analytics SDK", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    trackVenueShareEvent("venue-1", "clipboard");

    expect(log).toHaveBeenCalledWith("venue_share", { venueId: "venue-1", method: "clipboard" });
    log.mockRestore();
  });
});
