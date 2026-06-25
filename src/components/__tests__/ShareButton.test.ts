import { describe, expect, it } from "vitest";
import { buildVenueShareEndpoint, createVenueShareData } from "@/components/ShareButton";

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
});
