import { describe, expect, it } from "vitest";
import { makeHow, makeRun } from "../test-fixtures";
import { isUnreachable, loadErrorWords } from "./friendlyLoad";
import { CHANGE_ASSUMPTION_LINK, DISCLAIMER, LIMITS, formatHowValue, howMadeSentences } from "./how";
import { CHART, aheadOf10, chartGeometry, compareRows, initialChoice, parseChoice, scenarioChoices } from "./share";

describe("friendlyLoad", () => {
  it("recognises 'cannot reach the program'", () => {
    expect(isUnreachable("Could not reach the API. Is the backend running on http://localhost:8000?")).toBe(true);
    expect(isUnreachable("business not found")).toBe(false);
    expect(isUnreachable(null)).toBe(false);
    expect(isUnreachable(undefined)).toBe(false);
  });

  it("explains an unreachable program calmly, with what to do, and never shows the web address", () => {
    const w = loadErrorWords("Could not reach the API. Is the backend running on http://localhost:8000?", "your scenarios");
    expect(w.title).toBe("We can't reach the program that does the sums");
    expect(w.text).toContain("start.ps1");
    expect(w.text).toContain("Nothing you saved is lost");
    expect(w.title + w.text).not.toMatch(/localhost|http|API|500|404/);
  });

  it("any other failure says what could not load, without the raw message", () => {
    const w = loadErrorWords("Internal Server Error 500 at /businesses/3", "your run history");
    expect(w.title).toBe("We couldn't load your run history");
    expect(w.text).toContain("Nothing you saved is lost");
    expect(w.title + w.text).not.toMatch(/500|Internal|\/businesses/);
  });
});

describe("how we worked it out: the wording", () => {
  const sentences = howMadeSentences({ iterations: 1000, horizon: 12, engine_version: "0.1.0", seed: 1001 });

  it("is three or four short sentences with no equations", () => {
    expect(sentences).toHaveLength(4);
    for (const s of sentences) expect(s).not.toMatch(/[=∑√^]|\bp10\b|\bp50\b|\bp90\b|Monte Carlo|elasticity|percentile|baseline/i);
  });

  it("uses the stored run's own numbers", () => {
    expect(sentences[0]).toContain("next 12 months");
    expect(sentences[0]).toContain("1,000");
    expect(sentences[3]).toContain("program version 0.1.0");
    expect(sentences[3]).toContain("starting number 1001");
  });

  it("explains the line and the shaded area", () => {
    expect(sentences[1]).toContain("most likely path");
    expect(sentences[1]).toContain("bad case to a good case");
  });

  it("lists honest limits: marketing, seasons, not a forecast, not advice", () => {
    const all = LIMITS.join(" ");
    expect(all).toContain("marketing");
    expect(all).toContain("has not been checked against real data");
    expect(all).toContain("Busy and quiet seasons");
    expect(all).toContain("not a forecast");
    expect(all).toContain("not financial advice");
  });

  it("has the standard disclaimer", () => {
    expect(DISCLAIMER).toBe("Scenarios, not forecasts. Built from typical numbers and the ones you gave us. Not financial advice.");
  });

  it("formats each kind of number", () => {
    expect(formatHowValue({ value: 3000, unit: "money" }, "USD")).toBe("$3,000");
    expect(formatHowValue({ value: 0.05, unit: "percent" }, "USD")).toBe("5%");
    expect(formatHowValue({ value: 150, unit: "count" }, "EUR")).toBe("150");
  });

  it("'Change this' goes to the assumed list on Today", () => {
    expect(CHANGE_ASSUMPTION_LINK).toBe("/today#assumed");
  });
});

describe("share: choosing a saved scenario", () => {
  const runs = [
    { id: 2, business_id: 1, engine_version: "1", seed: 1, iterations: 1000, horizon: 24, created_at: "x", scenario_names: ["baseline", "Raise prices"] },
    { id: 1, business_id: 1, engine_version: "1", seed: 1, iterations: 1000, horizon: 24, created_at: "x", scenario_names: ["baseline", "Hire", "Cut"] },
  ];

  it("lists every real scenario of every run, never the baseline", () => {
    const c = scenarioChoices(runs);
    expect(c.map((x) => x.label)).toEqual(["Raise prices (run #2)", "Hire (run #1)", "Cut (run #1)"]);
    expect(c[0].value).toBe("2|Raise prices");
  });

  it("parses a choice, even when the name has a bar in it", () => {
    expect(parseChoice("2|Raise prices")).toEqual({ runId: 2, scenario: "Raise prices" });
    expect(parseChoice("7|a|b")).toEqual({ runId: 7, scenario: "a|b" });
    for (const bad of ["", "x|y", "0|y", "|y", "nonsense"]) expect(parseChoice(bad)).toBeNull();
  });

  it("starts from the address: a run alone picks its first scenario, with a name picks that one, nonsense picks nothing", () => {
    const c = scenarioChoices(runs);
    expect(initialChoice(new URLSearchParams("run=1"), c)).toBe("1|Hire");
    expect(initialChoice(new URLSearchParams("run=1&scenario=Cut"), c)).toBe("1|Cut");
    expect(initialChoice(new URLSearchParams("run=9"), c)).toBe("");
    expect(initialChoice(new URLSearchParams(""), c)).toBe("");
  });
});

describe("share: with the change vs if you change nothing", () => {
  const run = makeRun();
  const [nothing, change] = run.results;
  const rows = compareRows(change, nothing, run.horizon, "USD");

  it("compares profit, range, cash, customers and the odds", () => {
    expect(rows.map((r) => r.label)).toEqual([
      "What you keep over 12 months (most likely)", "Bad case to good case", "Cash in the bank at the end", "Regular customers at the end",
      "Comes out ahead of changing nothing",
    ]);
    expect(rows[0]).toMatchObject({ withChange: "$82,800", without: "$67,000" });
    expect(rows[1]).toMatchObject({ withChange: "$61,000 to $99,000", without: "$50,000 to $82,000" });
    expect(rows[2]).toMatchObject({ withChange: "$112,000", without: "$90,000" });
    expect(rows[3]).toMatchObject({ withChange: "861", without: "900" });
    expect(rows[4]).toMatchObject({ withChange: "9 of 10 possible futures" });
  });

  it("leaves out the odds row if the run has none", () => {
    const plain = { ...change, summary: { ...change.summary, prob_beats_baseline_profit: undefined } };
    expect(compareRows(plain, nothing, 12, "USD")).toHaveLength(4);
  });

  it("aheadOf10 stays between 0 and 10", () => {
    expect(aheadOf10(0.93)).toBe(9);
    expect(aheadOf10(1)).toBe(10);
    expect(aheadOf10(0)).toBe(0);
    expect(aheadOf10(undefined)).toBeNull();
    expect(aheadOf10(7)).toBe(10);
  });
});

describe("share: the chart that prints", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: `M${i + 1}`, p10: 100 + i, p50: 150 + i, p90: 200 + i, baseline: 140 + i }));
  const g = chartGeometry(rows);
  const inside = (pair: string) => {
    const [x, y] = pair.split(",").map(Number);
    return x >= 0 && x <= CHART.width && y >= 0 && y <= CHART.height;
  };

  it("draws a band with a point for every month on both edges, a median and a dashed baseline", () => {
    expect(g.band.split(" ")).toHaveLength(24);
    expect(g.median.split(" ")).toHaveLength(12);
    expect(g.baseline?.split(" ")).toHaveLength(12);
  });

  it("keeps everything inside the picture, so nothing is cut off on paper", () => {
    for (const p of [...g.band.split(" "), ...g.median.split(" "), ...(g.baseline?.split(" ") ?? [])]) expect(inside(p), p).toBe(true);
    for (const t of g.yTicks) expect(t.y).toBeGreaterThanOrEqual(0);
    for (const t of g.xTicks) expect(t.x).toBeLessThanOrEqual(CHART.width);
  });

  it("higher numbers are drawn higher (smaller y)", () => {
    const y = (pair: string) => Number(pair.split(",")[1]);
    const med = g.median.split(" ");
    expect(y(med[11])).toBeLessThan(y(med[0]));
  });

  it("labels the first, middle and last month, and three heights", () => {
    expect(g.xTicks.map((t) => t.label)).toEqual(["M1", "M6", "M12"]);
    expect(g.yTicks).toHaveLength(3);
    expect(g.yTicks[0].value).toBeLessThan(g.yTicks[2].value);
  });

  it("has no baseline line unless every month has one", () => {
    expect(chartGeometry(rows.map(({ baseline: _b, ...r }) => r)).baseline).toBeNull();
  });

  it("copes with a flat line and with a single month", () => {
    const flat = chartGeometry(Array.from({ length: 12 }, (_, i) => ({ label: `M${i}`, p10: 5, p50: 5, p90: 5 })));
    expect(flat.median).not.toContain("NaN");
    expect(chartGeometry([{ label: "only", p10: 1, p50: 2, p90: 3 }]).median).not.toContain("NaN");
  });
});

describe("fixtures stay honest", () => {
  it("makeHow keeps told and assumed apart", () => {
    const h = makeHow();
    const told = new Set(h.told.map((t) => t.key));
    expect(h.assumed.every((a) => !told.has(a.field))).toBe(true);
  });
});
