// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInButton } from "@/components/CheckInButton";
import { ToastProvider } from "@/hooks/useToast";
import { HAPTICS_STORAGE_KEY } from "@/lib/haptics";

const getSession = vi.fn();

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: function LinkStub({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      [key: string]: unknown;
    }) {
      return React.createElement("a", { href, ...props }, children);
    },
  };
});

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const createMotionComponent = (tag: string) =>
    function MotionComponent({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      onAnimationComplete: _onAnimationComplete,
      ...props
    }: {
      children?: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      onAnimationComplete?: unknown;
      [key: string]: unknown;
    }) {
      return React.createElement(tag, props, children);
    };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, tag: string) => createMotionComponent(tag),
    }),
  };
});

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession,
    },
  }),
}));

function renderCheckInButton() {
  render(
    <ToastProvider>
      <CheckInButton venueId="sports-bar" venueName="Sports Bar" />
    </ToastProvider>,
  );
}

async function completeCheckIn() {
  renderCheckInButton();
  await userEvent.click(screen.getByRole("button", { name: "Check in at Sports Bar" }));
  await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Checked in at Sports Bar; try again/i })).toBeTruthy());
}

describe("CheckInButton haptics", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { pointsAwarded: 5, events: ["checkin"], streakCount: 1 } }), { status: 200 }),
    ));
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("vibrates when a signed-in user completes a check-in", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    await completeCheckIn();

    expect(vibrate).toHaveBeenCalledWith(10);
    expect(vibrate).toHaveBeenCalledWith([50, 30, 50]);
  });

  it("skips check-in vibration when haptics are disabled in localStorage", async () => {
    const vibrate = vi.fn();
    localStorage.setItem(HAPTICS_STORAGE_KEY, "false");
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    await completeCheckIn();

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("stores a successful check-in timestamp with the per-venue cooldown key", async () => {
    await completeCheckIn();

    const button = screen.getByRole("button", { name: /Checked in at Sports Bar; try again in 20 minutes/i });
    expect(button.textContent).toBe("Checked in ✓ · try again in 20m");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(localStorage.getItem("nv_last_checkin_sports-bar")).toBeTruthy();
  });

  it("updates the cooldown countdown every minute and returns to idle when it expires", async () => {
    const now = new Date("2026-06-27T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    localStorage.setItem("nv_last_checkin_sports-bar", String(now.getTime() - 18 * 60 * 1000));

    await act(async () => { renderCheckInButton(); });

    expect(screen.getByRole("button", { name: /try again in 2 minutes/i }).textContent).toBe("Checked in ✓ · try again in 2m");

    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByRole("button", { name: /try again in 1 minute/i }).textContent).toBe("Checked in ✓ · try again in 1m");

    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByRole("button", { name: "Check in at Sports Bar" })).toBeTruthy();
    expect(localStorage.getItem("nv_last_checkin_sports-bar")).toBeNull();
    vi.useRealTimers();
  }, 10000);
});
