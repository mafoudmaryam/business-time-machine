import { describe, expect, it } from "vitest";
import { capitalize, formatCount } from "./format";

describe("capitalize", () => {
  it("capitalizes the first letter", () => {
    expect(capitalize("guests")).toBe("Guests");
  });

  it("leaves an empty string alone", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("formatCount", () => {
  it("rounds and adds thousands separators", () => {
    expect(formatCount(1234.6)).toBe("1,235");
  });
});
