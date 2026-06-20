import { test } from "@playwright/test";

test.describe("Removed legacy agent-board scope", () => {
  test.skip("/agent-board was removed from the consumer app; internal tickets are coordination-only and not part of VibeCheck E2E", async () => {});
});
