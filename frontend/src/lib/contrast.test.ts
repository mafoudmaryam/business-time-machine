import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/** The palette lives in theme.css ("direction B"). Every text/background pair the screens use must pass WCAG AA:
 *  4.5:1 for normal text, 3:1 for large text and for the edges of controls. */
const read = (name: string) => readFileSync(resolve(process.cwd(), "src", name), "utf-8");
const css = read("theme.css") + read("index.css") + read("beginner.css") + read("redesign.css");

/** Looks a token up by name and follows `var(--other)` aliases until it reaches a colour. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  const value = m[1].trim();
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value);
  if (alias) return token(alias[1]);
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`token --${name} is not a plain colour: ${value}`);
  return value;
}

const BODY = 4.5;
const LARGE = 3;

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("uses the approved direction-B colours", () => {
    expect(token("cream")).toBe("#fff9f0");
    expect(token("green")).toBe("#2e7d50");
    expect(token("green-heading")).toBe("#226b41");
    expect(token("sage")).toBe("#e3f0e4");
    expect(token("amber")).toBe("#f2a33a");
    expect(token("amber-soft")).toBe("#fff1d6");
    expect(token("charcoal")).toBe("#26302a");
    expect(token("body")).toBe("#4a544d");
    expect(token("card-border")).toBe("#ddebdf");
  });

  const surfaces = ["cream", "white", "sage", "amber-soft"] as const;

  for (const surface of surfaces) {
    it(`body text colours are readable on --${surface}`, () => {
      for (const text of ["charcoal", "body", "muted-2", "green-heading", "amber-ink", "error"]) {
        expect(contrastRatio(token(text), token(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(BODY);
      }
    });
  }

  it("plain green is readable as text on cream and white, and as large text on sage", () => {
    expect(contrastRatio(token("green"), token("cream"))).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio(token("green"), token("white"))).toBeGreaterThanOrEqual(BODY);
    // On sage it is only for the big numbers (large text); smaller green text on sage uses the heading green.
    expect(contrastRatio(token("green"), token("sage"))).toBeGreaterThanOrEqual(LARGE);
  });

  it("button text is readable on the green button and the amber button", () => {
    expect(contrastRatio(token("white"), token("green"))).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio(token("charcoal"), token("amber"))).toBeGreaterThanOrEqual(BODY);
  });

  it("the legacy names still point at readable colours", () => {
    for (const surface of ["page", "card", "band"]) {
      for (const text of ["ink", "muted-1", "muted-2", "button"]) {
        expect(contrastRatio(token(text), token(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(
          surface === "band" && text === "button" ? LARGE : BODY,
        );
      }
    }
    expect(contrastRatio(token("button-text"), token("button"))).toBeGreaterThanOrEqual(BODY);
  });

  it("form controls have an edge that stands out (3:1) from the page and the card", () => {
    expect(contrastRatio(token("input-border"), token("white"))).toBeGreaterThanOrEqual(LARGE);
    expect(contrastRatio(token("input-border"), token("cream"))).toBeGreaterThanOrEqual(LARGE);
  });

  it("the slider thumb and the dots (green) stand out from the page", () => {
    expect(contrastRatio(token("green"), token("cream"))).toBeGreaterThanOrEqual(LARGE);
    expect(contrastRatio(token("green"), token("white"))).toBeGreaterThanOrEqual(LARGE);
  });

  it("the coach card tiles keep readable good and bad numbers", () => {
    expect(contrastRatio("#17704f", "#ffffff")).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio("#a5301f", "#ffffff")).toBeGreaterThanOrEqual(BODY);
  });

  it("text on the flagged (amber) assumption rows is readable", () => {
    expect(contrastRatio(token("ink"), "#fbf0d9")).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio(token("muted-1"), "#fbf0d9")).toBeGreaterThanOrEqual(BODY);
  });
});
