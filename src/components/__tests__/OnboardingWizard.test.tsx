// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { OnboardingWizard } from "../OnboardingWizard";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/PushOptIn", () => ({
  PushOptIn: ({ buttonLabel, onAttemptComplete }: { buttonLabel?: string; onAttemptComplete?: () => void }) =>
    React.createElement("button", { type: "button", onClick: onAttemptComplete }, buttonLabel ?? "Allow notifications"),
}));

describe("OnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function renderWelcome() {
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: "Your city's nightlife, live." });
  }

  async function advanceToZonePicker(user = userEvent.setup()) {
    await renderWelcome();
    await user.click(screen.getByRole("button", { name: "Get Started" }));
    await screen.findByRole("heading", { name: "Where do you go out?" });
    return user;
  }

  async function advanceToPushOptIn(user = userEvent.setup()) {
    await advanceToZonePicker(user);
    await user.click(screen.getByRole("button", { name: "South End" }));
    await user.click(screen.getByRole("button", { name: "Let's Go" }));
    await screen.findByRole("heading", { name: "Stay in the loop" });
    return user;
  }

  it("does not render when localStorage nv_onboarded is 1", async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("renders screen 1 welcome on first launch with no localStorage key", async () => {
    await renderWelcome();

    expect(screen.getByText("Real vibes. Real check-ins. No algorithms.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeTruthy();
  });

  it("advances to screen 2 zone picker when Get Started is clicked", async () => {
    await advanceToZonePicker();

    expect(screen.getByRole("heading", { name: "Where do you go out?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "South End" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dilworth" })).toBeTruthy();
  });

  it("enables the Let's Go CTA after selecting a zone", async () => {
    const user = await advanceToZonePicker();
    const cta = screen.getByRole("button", { name: "Let's Go" });

    expect(cta).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: "South End" }));

    expect(cta).toHaveProperty("disabled", false);
  });

  it("advances to screen 3 push opt-in when Let's Go is clicked", async () => {
    await advanceToPushOptIn();

    expect(screen.getByText("Get notified when your favorite spots get busy.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
  });

  it("sets localStorage and redirects to /explore when Maybe later is clicked", async () => {
    const user = await advanceToPushOptIn();

    await user.click(screen.getByRole("button", { name: "Maybe later" }));

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(push).toHaveBeenCalledWith("/explore");
  });

  it("sets localStorage and navigates to /explore after completing the full flow", async () => {
    const user = await advanceToPushOptIn();

    await user.click(screen.getByRole("button", { name: "Allow notifications" }));

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(push).toHaveBeenCalledWith("/explore");
  });
});
