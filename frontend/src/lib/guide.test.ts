import { describe, expect, it } from "vitest";
import {
  DISCLAIMER, EMPTY_DRAFT, STARTING_PICTURE, basisText, dateText, draftFromAnswers, lineValue, moneyRange, planTitle, stepFromParam,
  toAnswers, validateStep, type GuideDraft,
} from "./guide";

const draft = (over: Partial<GuideDraft> = {}): GuideDraft => ({ ...EMPTY_DRAFT, ...over });

describe("the standing words", () => {
  it("are exactly the approved sentences", () => {
    expect(DISCLAIMER).toBe("A rough estimate, not advice. Real costs depend on your city and your choices.");
    expect(STARTING_PICTURE).toBe("This is a starting picture. It assumes your business is open and running smoothly.");
  });
});

describe("validateStep (plain words, only what is truly needed)", () => {
  it("asks for a choice on the choice screens", () => {
    expect(validateStep("type", draft()).business_type).toMatch(/choose what you would like to open/);
    expect(validateStep("country", draft()).country).toMatch(/choose a country/);
    expect(validateStep("premises", draft()).premises).toBeTruthy();
    expect(validateStep("size", draft()).size).toBeTruthy();
    expect(validateStep("timeline", draft()).timeline).toBeTruthy();
    expect(validateStep("serve", draft())).toEqual({ menu: "Please choose a menu.", alcohol: "Please choose one." });
    expect(validateStep("type", draft({ business_type: "cafe" }))).toEqual({});
  });

  it("lets every optional number stay empty (not sure) and never forces a zero", () => {
    expect(validateStep("budget", draft())).toEqual({});
    expect(validateStep("customers", draft())).toEqual({});
    expect(validateStep("premises", draft({ premises: "ready" }))).toEqual({});
  });

  it("refuses silly numbers with a sentence", () => {
    expect(validateStep("budget", draft({ budget: -5 })).budget).toMatch(/more than zero/);
    expect(validateStep("customers", draft({ customers_per_day: 0 })).customers_per_day).toMatch(/more than zero/);
    expect(validateStep("customers", draft({ avg_spend: 1e9 })).avg_spend).toMatch(/too large/);
    expect(validateStep("customers", draft({ ingredient_share: 100 })).ingredient_share).toMatch(/between 0 and 99/);
    expect(validateStep("customers", draft({ ingredient_share: 0 }))).toEqual({});
  });

  it("needs a head count, and says so plainly", () => {
    expect(validateStep("people", draft()).people).toMatch(/how many people/);
    expect(validateStep("people", draft({ people: 0 })).people).toMatch(/more than zero/);
    expect(validateStep("people", draft({ people: 501 })).people).toMatch(/too many/);
    expect(validateStep("people", draft({ people: 1 }))).toEqual({});
  });
});

describe("answers", () => {
  it("turns empty boxes into null (not sure), never 0", () => {
    const a = toAnswers(draft({ business_type: "cafe", country: "US", people: 3 }));
    expect(a.budget).toBeNull();
    expect(a.rent).toBeNull();
    expect(a.customers_per_day).toBeNull();
    expect(a.avg_spend).toBeNull();
    expect(a.ingredient_share).toBeNull();
    expect(a.people).toBe(3);
  });

  it("round-trips through a saved plan's answers", () => {
    const d = draft({ business_type: "bakery", country: "UK", currency: "GBP", budget: 50000, premises: "fit_out", rent: 2500, size: "small", menu: "simple", alcohol: "no", people: 2, customers_per_day: 80, avg_spend: 4.5, ingredient_share: 30, timeline: "6m" });
    expect(draftFromAnswers(toAnswers(d))).toEqual(d);
  });

  it("reads the step from the address and ignores nonsense", () => {
    expect(stepFromParam("3")).toBe(2);
    expect(stepFromParam("9")).toBe(8);
    for (const bad of [null, "", "0", "10", "x", "2.5"]) expect(stepFromParam(bad)).toBe(0);
  });
});

describe("showing figures", () => {
  it("writes a sourced figure the way the guide says it", () => {
    expect(lineValue({ low: 30000, high: 150000, unit: "one_off", currency: "USD" })).toBe("$30,000 to $150,000");
    expect(lineValue({ low: 15.24, high: 15.24, unit: "per_hour", currency: "USD" })).toBe("$15.24 an hour");
    expect(lineValue({ low: 2000, high: 12000, unit: "per_month", currency: "USD" })).toBe("$2,000 to $12,000 a month");
    expect(lineValue({ low: 32.4, high: 32.4, unit: "percent_of_sales", currency: null })).toBe("32.4% of sales");
    expect(lineValue({ low: 30, high: 34.1, unit: "percent_of_sales", currency: null })).toBe("30% to 34.1% of sales");
    expect(lineValue({ low: 28, high: 28, unit: "days", currency: null })).toBe("28 days");
    expect(lineValue({ low: 12.71, high: 12.71, unit: "per_hour", currency: "GBP" })).toBe("£12.71 an hour");
    expect(moneyRange(100, 100, "USD")).toBe("$100");
  });

  it("says what kind of number a single figure is", () => {
    expect(basisText("single_value")).toMatch(/one figure from one guide/);
    expect(basisText("legal_minimum")).toMatch(/not typical pay/);
    expect(basisText("range")).toBeNull();
  });

  it("writes dates in words and says when a link has never been checked", () => {
    expect(dateText("2026-10-10")).toBe("10 October 2026");
    expect(dateText(null)).toBe("not yet");
  });

  it("titles the plan without inventing anything", () => {
    expect(planTitle("cafe", "United States")).toBe("A small café in the United States");
    expect(planTitle("bakery", "China")).toBe("A small bakery in China");
    expect(planTitle("restaurant", "Somewhere else")).toBe("A small restaurant in your country");
  });
});
