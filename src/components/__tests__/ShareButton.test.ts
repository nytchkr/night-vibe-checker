import { describe, expect, it, vi } from "vitest";
import {
  buildVenueShareClipboardText,
  buildVenueShareEndpoint,
  createVenueShareData,
  trackVenueShareEvent,
} from "@/components/ShareButton";

describe("ShareButton share-card helpers", () => {
  it("builds the venue share-card endpoint with an encoded venue id", () => {
    expect(buildVenueShareEndpoint("venue/id with spaces")).toBe(
      "/api/venues/venue%2Fid%20with%20spaces/share-card",
    );
  });

  it("creates native share data from the share-card response", () => {
    expect(
      createVenueShareData("Test Bar", {
        shareUrl: "https://nytchkr.com/venues/test-bar?ref=share",
        text: "Test Bar is Packed right now on NightVibe",
      }),
    ).toEqual({
      title: "Test Bar on NightVibe",
      text: "Test Bar is Packed right now on NightVibe",
      url: "https://nytchkr.com/venues/test-bar?ref=share",
    });
  });

  it("builds fallback clipboard text with venue summary and URL", () => {
    expect(
      buildVenueShareClipboardText({
        title: "Test Bar on NightVibe",
        text: "Test Bar is Packed right now on NightVibe",
        url: "https://nytchkr.com/venues/test-bar?ref=share",
      }),
    ).toBe("Test Bar is Packed right now on NightVibe https://nytchkr.com/venues/test-bar?ref=share");
  });

  it("does not duplicate the URL when share text already includes it", () => {
    expect(
      buildVenueShareClipboardText({
        title: "Test Bar on NightVibe",
        text: "Test Bar is Packed right now on NightVibe https://nytchkr.com/venues/test-bar?ref=share",
        url: "https://nytchkr.com/venues/test-bar?ref=share",
      }),
    ).toBe("Test Bar is Packed right now on NightVibe https://nytchkr.com/venues/test-bar?ref=share");
  });

  it("tracks venue share events without an analytics SDK", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    trackVenueShareEvent("venue-1", "clipboard");

    expect(log).toHaveBeenCalledWith("venue_share", { venueId: "venue-1", method: "clipboard" });
    log.mockRestore();
  });
});
