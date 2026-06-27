// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MFBar } from "@/components/MFBar";

vi.mock("framer-motion/client", () => ({
  div: ({
    children,
    initial: _initial,
    animate: _animate,
    transition: _transition,
    layoutId: _layoutId,
    ...props
  }: {
    children?: React.ReactNode;
    initial?: unknown;
    animate?: unknown;
    transition?: unknown;
    layoutId?: string;
    [key: string]: unknown;
  }) => React.createElement("div", props, children),
}));

describe("MFBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the M/F ratio with 5 or more samples", () => {
    render(<MFBar malePercent={62} sampleSize={5} source="live" />);

    expect(screen.getByRole("meter", { name: /M\/F ratio from 5 check-ins/i })).toBeTruthy();
    expect(screen.getByText("62% guys")).toBeTruthy();
    expect(screen.getByText("38% girls")).toBeTruthy();
    expect(screen.getByText("M/F ratio from 5 check-ins")).toBeTruthy();
  });

  it("hides the M/F ratio with fewer than 5 samples", () => {
    const { container } = render(<MFBar malePercent={62} sampleSize={4} source="live" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("hides the M/F ratio when mfRatio is null", () => {
    const { container } = render(<MFBar malePercent={null} sampleSize={8} source="live" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });
});
