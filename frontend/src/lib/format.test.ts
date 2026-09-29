import { describe, expect, it } from "vitest";
import { capitalize, currencySymbol, formatCount, formatMoney, formatPrice, formatUnit } from "./format";

describe("currencySymbol", () => {
  it("gives the right symbol per currency, no hard-coded default", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("JPY")).toBe("¥");
    expect(currencySymbol("EUR")).toBe("€");
  });
});

describe("formatMoney", () => {
  it("formats using the given currency, rounded to whole units", () => {
    expect(formatMoney(1234.6, "USD")).toBe("$1,235");
    expect(formatMoney(1234, "JPY")).toBe("¥1,234");
  });
});

describe("formatUnit", () => {
  it("substitutes the {CUR} placeholder with the currency's symbol", () => {
    expect(formatUnit("{CUR}/visit", "USD")).toBe("$/visit");
    expect(formatUnit("{CUR}/visit", "EUR")).toBe("€/visit");
  });

  it("leaves templates without a placeholder untouched", () => {
    expect(formatUnit("visits/month", "USD")).toBe("visits/month");
  });
});

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

describe("formatPrice", () => {
  it("keeps the cents on a small price", () => {
    expect(formatPrice(6.5, "USD")).toBe("$6.50");
  });
  it("uses whole units for round or large amounts", () => {
    expect(formatPrice(7, "USD")).toBe("$7");
    expect(formatPrice(1234.5, "USD")).toBe("$1,235");
  });
});
