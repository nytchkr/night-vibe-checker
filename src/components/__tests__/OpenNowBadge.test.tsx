// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpenNowBadge } from "@/components/OpenNowBadge";

describe("OpenNowBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the badge only when Google explicitly says the venue is open", () => {
    render(<OpenNowBadge openNow />);

    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("does not show a badge when openNow is null", () => {
    const { container } = render(<OpenNowBadge openNow={null} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
  });
});
