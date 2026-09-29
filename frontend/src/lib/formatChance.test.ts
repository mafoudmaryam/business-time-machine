import { describe, expect, it } from "vitest";
import { chanceOutOf10, signed } from "./formatChance";

describe("chanceOutOf10", () => {
  it("rounds to the nearest of 10 futures", () => {
    expect(chanceOutOf10(0.77)).toBe("8 of 10 futures");
    expect(chanceOutOf10(0.5)).toBe("5 of 10 futures");
  });

  it("never says 'none' when there is a small real chance", () => {
    expect(chanceOutOf10(0)).toBe("none of 10 futures");
    expect(chanceOutOf10(0.03)).toBe("less than 1 of 10 futures");
  });

  it("never says 'all' unless it really is all", () => {
    expect(chanceOutOf10(1)).toBe("all 10 futures");
    expect(chanceOutOf10(0.97)).toBe("almost all 10 futures");
  });
});

describe("signed", () => {
  const fmt = (n: number) => `$${n}`;
  it("adds a plus or minus sign", () => {
    expect(signed(1500, fmt)).toBe("+$1500");
    expect(signed(-800, fmt)).toBe("−$800");
  });
  it("shows zero without a sign", () => {
    expect(signed(0.2, fmt)).toBe("$0");
  });
});
