/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaListener>();
  const mediaQueryList = {
    media: "(prefers-reduced-motion: reduce)",
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((event: string, listener: MatchMediaListener) => {
      if (event === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: MatchMediaListener) => {
      if (event === "change") listeners.delete(listener);
    }),
    addListener: vi.fn((listener: MatchMediaListener) => listeners.add(listener)),
    removeListener: vi.fn((listener: MatchMediaListener) => listeners.delete(listener)),
    onchange: null,
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  window.matchMedia = vi.fn(() => mediaQueryList);

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function renderReducedMotionProbe(onChange: (value: boolean) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const reducedMotion = useReducedMotion();
    onChange(reducedMotion);
    return null;
  }

  act(() => {
    root.render(React.createElement(Probe));
  });

  return { root, container };
}

function cleanupProbe(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

describe("useReducedMotion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("reads the current prefers-reduced-motion matchMedia value", () => {
    installMatchMedia(true);
    const values: boolean[] = [];

    const { root, container } = renderReducedMotionProbe((value) => values.push(value));

    expect(values.at(-1)).toBe(true);
    cleanupProbe(root, container);
  });

  it("updates when the media query changes", () => {
    const controls = installMatchMedia(false);
    const values: boolean[] = [];
    const { root, container } = renderReducedMotionProbe((value) => values.push(value));

    expect(values.at(-1)).toBe(false);

    act(() => {
      controls.setMatches(true);
    });

    expect(values.at(-1)).toBe(true);
    cleanupProbe(root, container);
  });
});
