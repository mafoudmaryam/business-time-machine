import { describe, expect, it } from "vitest";
import type { CoachSummary } from "../api";
import { barWidths, buildTiles, signedMoney, trendOf, VERDICT_CLASS, yearsText } from "./coachView";

const summary: CoachSummary = {
  tiles: [
    { key: "profit", now: 2100, later: 3900 },
    { key: "cash", now: 25000, later: 18000 },
    { key: "customers", now: 900, later: 912 },
  ],
  customers_word: "guests",
  scenario: "Raise prices",
  verdict: { key: "good", label: "Good idea" },
  months: 24,
  profit_change: 26900,
  better_of_10: 8,
  regulars_change_count: -26,
  regulars_change_percent: -3,
  bars: [],
  risk_flags: [],
  has_risk: false,
};

describe("coachView", () => {
  it("signs money with a real minus", () => {
    expect(signedMoney(18000, "USD")).toBe("+$18,000");
    expect(signedMoney(-1200, "USD")).toBe("−$1,200");
    expect(signedMoney(500, "EUR")).toBe("+€500");
  });

  it("every verdict has its own class", () => {
    expect(new Set(Object.values(VERDICT_CLASS)).size).toBe(4);
  });

  it("scales bars to the biggest driver, never thinner than the minimum", () => {
    const bars = [
      { key: "price", label: "Higher prices", amount: 100000 },
      { key: "visits", label: "Fewer visits", amount: -50000 },
      { key: "staff", label: "Staff", amount: -1000 },
    ];
    expect(barWidths(bars)).toEqual([100, 50, 4]);
    expect(barWidths([{ key: "x", label: "X", amount: 0 }])).toEqual([4]);
    expect(barWidths([])).toEqual([]);
  });

  it("makes a small driver look much smaller than a big one", () => {
    const [ingredients, marketing] = barWidths([
      { key: "ingredients", label: "Ingredients", amount: -17800 },
      { key: "fixed", label: "Marketing", amount: -1440 },
    ]);
    expect(ingredients).toBe(100);
    expect(marketing).toBe(8); // 1,440 / 17,800, not a fat 22% stub
  });

  it("calls a change under 3% 'about the same'", () => {
    expect(trendOf(1000, 1015)).toBe("same");
    expect(trendOf(1000, 1029)).toBe("same");
    expect(trendOf(1000, 1031)).toBe("up");
    expect(trendOf(1000, 970)).toBe("down");
    expect(trendOf(1000, 1100)).toBe("up");
    expect(trendOf(1000, 800)).toBe("down");
    expect(trendOf(0, 0)).toBe("same");
    expect(trendOf(-500, 200)).toBe("up");
  });

  it("words the years", () => {
    expect(yearsText(12)).toBe("1 year");
    expect(yearsText(36)).toBe("3 years");
    expect(yearsText(18)).toBe("18 months");
  });

  it("words the three now-to-later tiles from the engine numbers", () => {
    const [profit, cash, guests] = buildTiles(summary, "USD");
    expect(profit).toMatchObject({ title: "Profit a month", now: "$2,100", later: "$3,900", trend: "up", trendLabel: "Better" });
    expect(cash).toMatchObject({ title: "Cash in the bank", now: "$25,000", later: "$18,000", trend: "down", trendLabel: "Lower" });
    expect(guests).toMatchObject({ title: "Guests", now: "900", later: "912", trend: "same", trendLabel: "About the same" });
    expect(profit.spoken).toBe("Now $2,100, in 2 years $3,900. Better.");
  });

  it("uses the business's currency and 'More' / 'Fewer' for customers", () => {
    const tiles = buildTiles(
      { ...summary, tiles: [summary.tiles[0], summary.tiles[1], { key: "customers", now: 900, later: 700 }] },
      "EUR",
    );
    expect(tiles[0].now).toBe("€2,100");
    expect(tiles[2].trendLabel).toBe("Fewer");
    expect(tiles[2].trend).toBe("down");
  });
});
