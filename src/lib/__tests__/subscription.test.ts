import { describe, expect, it } from "vitest";
import { isActiveProSubscription, normalizeSubscription } from "@/lib/subscription";

describe("subscription helpers", () => {
  it("defaults missing subscriptions to free and inactive", () => {
    expect(normalizeSubscription(null)).toEqual({ plan: "free", status: "inactive" });
  });

  it("normalizes only active pro rows as pro access", () => {
    const activePro = normalizeSubscription({ plan: "pro", status: "active" });
    const inactivePro = normalizeSubscription({ plan: "pro", status: "cancelled" });

    expect(isActiveProSubscription(activePro)).toBe(true);
    expect(activePro).toEqual({ plan: "pro", status: "active" });
    expect(isActiveProSubscription(inactivePro)).toBe(false);
    expect(inactivePro).toEqual({ plan: "pro", status: "inactive" });
  });
});
