import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** House rules of the 2026 look, checked on the source files so they cannot quietly drift:
 *  one place for colours, no old-look colours, motion that switches off, and a plain print page. */
const SRC = resolve(process.cwd(), "src");
const read = (name: string) => readFileSync(join(SRC, name), "utf-8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(css|tsx?)$/.test(entry) && !/\.test\./.test(entry) ? [full] : [];
  });
}

describe("the 2026 look", () => {
  it("keeps no colour from the old brown look anywhere in the app", () => {
    const OLD = ["#6b4331", "#2b1d16", "#faf5ef", "#f3eae1", "#eadbcd", "#e2d3c3", "#4a3527", "#6f5a4a", "#d9c4ae", "#d9ccbd", "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#c0392b", "#a3281b"];
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf-8").toLowerCase();
      for (const colour of OLD) if (text.includes(colour)) hits.push(`${file.replace(SRC, "")}: ${colour}`);
    }
    expect(hits).toEqual([]);
  });

  it("defines the approved palette in theme.css and nowhere else", () => {
    const theme = read("theme.css");
    for (const [name, value] of [["cream", "#fff9f0"], ["green", "#2e7d50"], ["green-heading", "#226b41"], ["sage", "#e3f0e4"], ["amber", "#f2a33a"], ["amber-soft", "#fff1d6"], ["charcoal", "#26302a"], ["body", "#4a544d"], ["card-border", "#ddebdf"]] as const) {
      expect(theme).toContain(`--${name}: ${value}`);
    }
    for (const css of ["index.css", "beginner.css", "redesign.css"]) {
      expect(read(css), `${css} must not define the palette`).not.toMatch(/--(cream|green|green-heading|sage|amber|charcoal|body|card-border):\s*#/);
    }
  });

  it("uses only the three approved fonts", () => {
    const css = ["theme.css", "index.css", "beginner.css", "redesign.css"].map(read).join("\n");
    const families = new Set([...css.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
    expect([...families].sort()).toEqual(["Inter", "Nunito", "Patrick Hand"]);
  });

  it("switches every animation and transition off for people who ask for less motion", () => {
    const css = read("redesign.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).toMatch(/\.confetti-layer[^}]*display:\s*none/);
  });

  it("a compact empty state is a full-width card inside a page, not the narrow centred box", () => {
    const css = read("redesign.css");
    const rule = css.slice(css.lastIndexOf(".empty-state-compact {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/max-width:\s*none/);
  });

  it("prints the start-up plan in plain black on white, with every checklist card readable", () => {
    const css = read("redesign.css");
    const print = css.slice(css.lastIndexOf("@media print"));
    expect(print).toMatch(/\.guide-plan/);
    expect(print).toMatch(/\.guide-plan a\[href\^="http"\]::after/);
  });

  it("ends with a print block that is plain black on white, with no decoration", () => {
    const css = read("redesign.css");
    const print = css.slice(css.lastIndexOf("@media print"));
    expect(print.length).toBeGreaterThan(200);
    expect(print).toMatch(/background:\s*#ffffff\s*!important/);
    expect(print).toMatch(/color:\s*#000000\s*!important/);
    expect(print).toMatch(/box-shadow:\s*none\s*!important/);
    expect(print).toMatch(/\.share-sheet[^}]*border-radius:\s*0/);
    // the chart on paper is black and grey, never green or amber
    expect(print).toMatch(/\.plan-median\s*\{[^}]*stroke:\s*#000000/);
    expect(print).not.toMatch(/var\(--(green|amber|sage)/);
    // the print block really is the last thing in the file: walk its braces to the end and check nothing follows
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf("{", css.lastIndexOf("@media print")); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    expect(end).toBeGreaterThan(0);
    expect(css.slice(end + 1).trim()).toBe("");
  });

  it("keeps the share page's screen styling out of print (it lives in @media screen)", () => {
    const css = read("redesign.css");
    const start = css.indexOf("/* ---------- Share page (on screen only");
    const end = css.indexOf("/* ---------- Leftover pieces");
    expect(css.slice(start, end)).toContain("@media screen {");
  });
});
