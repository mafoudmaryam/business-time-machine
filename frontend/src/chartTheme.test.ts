import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHART, SERIES_STYLES } from "./chartTheme";
import { contrastRatio } from "./lib/contrast";

const theme = readFileSync(resolve(process.cwd(), "src", "theme.css"), "utf-8");
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(theme)?.[1].toLowerCase();

describe("chart colour system", () => {
  it("uses exactly the colours of theme.css", () => {
    expect(CHART.main).toBe(token("green"));
    expect(CHART.mainDeep).toBe(token("green-heading"));
    expect(CHART.caution).toBe(token("amber"));
    expect(CHART.cautionLine).toBe(token("amber-ink"));
    expect(CHART.band).toBe(token("sage"));
    expect(CHART.bandEdge).toBe(token("sage-edge"));
    expect(CHART.text).toBe(token("charcoal"));
    expect(CHART.baseline).toBe(token("body"));
    expect(CHART.grid).toBe(token("card-border"));
  });

  it("every line can be seen against the white chart card (3:1)", () => {
    for (const { color } of SERIES_STYLES) expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(CHART.cautionLine, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("series differ by dash pattern as well as colour, so colour is never the only clue", () => {
    const dashes = SERIES_STYLES.map((s) => s.dash ?? "solid");
    expect(new Set(dashes).size).toBe(SERIES_STYLES.length);
  });
});
