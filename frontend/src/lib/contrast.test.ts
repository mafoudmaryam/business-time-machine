import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/** The palette from index.css / beginner.css. The text colours used on the new screens must stay readable. */
const read = (name: string) => readFileSync(resolve(process.cwd(), "src", name), "utf-8");
const css = read("index.css") + read("beginner.css");

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
}

const BODY = 4.5;
const LARGE = 3;

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  const surfaces = ["page", "card", "band"] as const;

  for (const surface of surfaces) {
    it(`body text colours are readable on --${surface}`, () => {
      for (const text of ["ink", "muted-1", "muted-2", "button"]) {
        expect(contrastRatio(token(text), token(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(BODY);
      }
    });
  }

  it("button text is readable on the button", () => {
    expect(contrastRatio(token("button-text"), token("button"))).toBeGreaterThanOrEqual(BODY);
  });

  it("good and bad tile numbers and risk lines are readable on the card", () => {
    expect(contrastRatio("#11694b", token("card"))).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio("#a3281b", token("card"))).toBeGreaterThanOrEqual(BODY);
  });

  it("the error colour is readable on the page", () => {
    expect(contrastRatio(token("danger"), token("page"))).toBeGreaterThanOrEqual(BODY);
  });

  it("the focus ring and card borders stand out enough from the page", () => {
    expect(contrastRatio(token("button"), token("page"))).toBeGreaterThanOrEqual(LARGE);
  });

  it("text on the flagged (amber) assumption rows is readable", () => {
    expect(contrastRatio(token("ink"), "#fbf0d9")).toBeGreaterThanOrEqual(BODY);
    expect(contrastRatio(token("muted-1"), "#fbf0d9")).toBeGreaterThanOrEqual(BODY);
  });
});
