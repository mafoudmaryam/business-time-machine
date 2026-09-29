import { describe, expect, it } from "vitest";
import { readBusinessId, withBusiness } from "./businessParam";

describe("readBusinessId", () => {
  it("reads a valid id", () => {
    expect(readBusinessId(new URLSearchParams("business=3"))).toBe(3);
  });
  it("ignores missing or broken values", () => {
    expect(readBusinessId(new URLSearchParams(""))).toBeNull();
    expect(readBusinessId(new URLSearchParams("business=abc"))).toBeNull();
    expect(readBusinessId(new URLSearchParams("business=0"))).toBeNull();
  });
});

describe("withBusiness", () => {
  it("adds the business to a link when one is selected", () => {
    expect(withBusiness("/compare", 3)).toBe("/compare?business=3");
    expect(withBusiness("/compare", null)).toBe("/compare");
  });
});
