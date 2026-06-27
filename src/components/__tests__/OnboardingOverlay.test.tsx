// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingOverlay } from "../OnboardingOverlay";
import { ONBOARDING_STORAGE_KEY, PREFERRED_ZONE_STORAGE_KEY } from "@/lib/onboarding";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("framer-motion/client", () => ({
  div: ({
    children,
    initial: _initial,
    animate: _animate,
    transition: _transition,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; transition?: unknown }) =>
    React.createElement("div", props, children),
  span: ({
    children,
    initial: _initial,
    animate: _animate,
    transition: _transition,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { initial?: unknown; animate?: unknown; transition?: unknown }) =>
    React.createElement("span", props, children),
}));

vi.mock("@/lib/haptics", () => ({
  triggerHapticFeedback: vi.fn(),
}));

describe("OnboardingOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves the selected zone and advances to the how-it-works step", async () => {
    const user = userEvent.setup();

    render(<OnboardingOverlay forceOpen />);

    expect(screen.getByRole("heading", { name: "Pick your zone" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Dilworth/i }));

    expect(localStorage.getItem(PREFERRED_ZONE_STORAGE_KEY)).toBe("dilworth-charlotte");
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();

    await waitFor(() => expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy());
    expect(screen.getByText("Check-in at a venue")).toBeTruthy();
    expect(screen.getByText("See live busyness")).toBeTruthy();
    expect(screen.getByText("Discover trending spots")).toBeTruthy();
  });

  it("dismisses and saves onboarding on completion", async () => {
    const user = userEvent.setup();

    render(<OnboardingOverlay forceOpen />);

    await user.click(screen.getByRole("button", { name: /South Park/i }));
    await screen.findByRole("heading", { name: "How it works" });
    await user.click(screen.getByRole("button", { name: "Start exploring" }));

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
    expect(localStorage.getItem(PREFERRED_ZONE_STORAGE_KEY)).toBe("south-park-charlotte");
    expect(push).toHaveBeenCalledWith("/explore?zone=south-park-charlotte");
  });
});
