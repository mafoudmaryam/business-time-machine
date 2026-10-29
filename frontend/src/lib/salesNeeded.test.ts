import { describe, expect, it } from "vitest";
import { formatDailyAverage, formatToolCount, formatToolMoney, validateToolField } from "./salesNeeded";

describe("tool input validation", () => {
  it.each(["", "-1", "NaN", "Infinity", "1e3", "1,2", "$20", "1.0000001"])("rejects %s instead of assuming zero", text => {
    for (const field of ["selling_price", "cost_per_sale", "monthly_costs"] as const) expect(validateToolField(field, text)).not.toBeNull();
  });
  it.each(["0", "0.000001", "1,200.50", ".5", "1."])("keeps valid entered amount %s", text => {
    expect(validateToolField("cost_per_sale", text)).toBeNull();
  });
  it.each(["0", "32", "-1", "1.5", "NaN"])("rejects invalid opening days %s", text => expect(validateToolField("opening_days", text)).not.toBeNull());
  it.each(["", "1", "31"])("accepts optional opening days %s", text => expect(validateToolField("opening_days", text)).toBeNull());
});

describe("exact result display", () => {
  it("uses the chosen currency with its usual precision", () => {
    expect(formatToolMoney("3.5", "USD", "en-US")).toBe("$3.50");
    expect(formatToolMoney("3.5", "EUR", "en-US")).toBe("€3.50");
    expect(formatToolMoney("100", "JPY", "en-US")).toBe("¥100");
    expect(formatToolMoney("3", "KWD", "en-US")).toMatch(/3\.000/);
  });
  it("keeps tiny positive amounts and negative contributions visible", () => {
    expect(formatToolMoney("0.000001", "USD", "en-US")).toBe("$0.000001");
    expect(formatToolMoney("-0.1", "USD", "en-US")).toBe("-$0.10");
    expect(formatToolMoney("-1000.25", "EUR", "en-US")).toBe("-€1,000.25");
  });
  it("does not lose large counts or decimal strings through Number", () => {
    expect(formatToolCount("999999999999999999", "en-US")).toBe("999,999,999,999,999,999");
    expect(formatToolMoney("999999999999999999.25", "USD", "en-US")).toBe("$999,999,999,999,999,999.25");
    expect(formatDailyAverage("0.69", "en-US")).toBe("0.69");
    expect(formatDailyAverage("0.69", "de-DE")).toBe("0,69");
  });
});
