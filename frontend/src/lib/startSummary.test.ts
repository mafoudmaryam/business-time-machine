import { describe, expect, it } from "vitest";
import type { StartingMonth } from "../api";
import { describeStartingMonth } from "./startSummary";

const base: StartingMonth = {
  sales: 51350,
  ingredient_costs: 15405,
  staff_costs: 15000,
  rent_and_other_costs: 15000,
  marketing: 400,
  costs: 45805,
  profit: 5545,
};

describe("describeStartingMonth", () => {
  it("says the owner makes money and gives no warning", () => {
    const s = describeStartingMonth(base, "USD");
    expect(s.text).toBe("About $51,350 in sales and $45,805 in costs, so you make about $5,545 a month.");
    expect(s.isLoss).toBe(false);
    expect(s.hint).toBeNull();
  });

  it("says the owner loses money, without a minus sign, and hints to check the numbers", () => {
    const s = describeStartingMonth({ ...base, sales: 48750, costs: 55625, profit: -6875 }, "USD");
    expect(s.text).toBe("About $48,750 in sales and $55,625 in costs, so you lose about $6,875 a month.");
    expect(s.isLoss).toBe(true);
    expect(s.hint).toMatch(/check your numbers/);
  });

  it("says break-even when the profit rounds to zero", () => {
    expect(describeStartingMonth({ ...base, profit: 0.2 }, "USD").text).toContain("roughly break even");
  });

  it("uses the business's own currency", () => {
    expect(describeStartingMonth(base, "EUR").text).toContain("€");
  });
});
