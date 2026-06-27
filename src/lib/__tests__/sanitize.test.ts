import { describe, expect, it } from "vitest";
import { sanitizeText } from "../sanitize";

describe("sanitizeText", () => {
  it("strips HTML tags and trims whitespace", () => {
    expect(sanitizeText("  <b onclick=\"alert(1)\">Line is moving</b>  ")).toBe("Line is moving");
  });

  it("removes script tags while keeping plain text content", () => {
    expect(sanitizeText("<script>alert('xss')</script>packed")).toBe("alert('xss')packed");
  });

  it("limits rendered text to 500 characters", () => {
    expect(sanitizeText("x".repeat(501))).toHaveLength(500);
  });
});
