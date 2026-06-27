import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HAPTICS_STORAGE_KEY,
  getHapticsPreference,
  setHapticsPreference,
  triggerHapticFeedback,
} from "@/lib/haptics";

function storageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("haptics", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the nv-haptics-enabled localStorage key and defaults on", () => {
    const localStorage = storageMock();
    vi.stubGlobal("window", { localStorage });

    expect(HAPTICS_STORAGE_KEY).toBe("nv-haptics-enabled");
    expect(getHapticsPreference()).toBe("on");

    setHapticsPreference("off");

    expect(localStorage.setItem).toHaveBeenCalledWith("nv-haptics-enabled", "false");
    expect(getHapticsPreference()).toBe("off");
  });

  it("does not vibrate when the user disables haptics", () => {
    const localStorage = storageMock({ [HAPTICS_STORAGE_KEY]: "false" });
    const vibrate = vi.fn();
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("navigator", { vibrate });

    triggerHapticFeedback(12);

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("wraps unavailable vibrate implementations safely", () => {
    const localStorage = storageMock({ [HAPTICS_STORAGE_KEY]: "true" });
    const vibrate = vi.fn(() => {
      throw new Error("not supported");
    });
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("navigator", { vibrate });

    expect(() => triggerHapticFeedback([8, 50, 8])).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith([8, 50, 8]);
  });
});
