import type { ScenarioResultOut, SimulationRunSummaryOut } from "../api";
import { formatCount, formatMoney } from "./format";
import { displayScenarioName } from "./scenarioLabel";

/** Helpers for the one-page summary. Words and drawing only: every number comes from the stored business or a stored run. */

// ---------- picking a saved scenario to compare ----------

export interface ScenarioChoice {
  /** "runId|scenario name" */
  value: string;
  label: string;
}

export function scenarioChoices(runs: SimulationRunSummaryOut[]): ScenarioChoice[] {
  return runs.flatMap((r) =>
    r.scenario_names
      .filter((n) => n !== "baseline")
      .map((n) => ({ value: `${r.id}|${n}`, label: `${displayScenarioName(n)} (run #${r.id})` })),
  );
}

export function parseChoice(value: string): { runId: number; scenario: string } | null {
  const i = value.indexOf("|");
  if (i < 1) return null;
  const runId = Number(value.slice(0, i));
  return Number.isInteger(runId) && runId > 0 ? { runId, scenario: value.slice(i + 1) } : null;
}

/** From the address (?run=7&scenario=Name): the choice to start with. Without a name, the first real scenario of that run. */
export function initialChoice(params: URLSearchParams, choices: ScenarioChoice[]): string {
  const run = params.get("run");
  if (!run) return "";
  const scenario = params.get("scenario");
  const hit = choices.find((c) => (scenario ? c.value === `${run}|${scenario}` : c.value.startsWith(`${run}|`)));
  return hit?.value ?? "";
}

// ---------- with the change vs if you change nothing ----------

export interface CompareRow {
  label: string;
  withChange: string;
  without: string;
}

export function aheadOf10(probability: number | undefined): number | null {
  if (probability === undefined) return null;
  return Math.max(0, Math.min(10, Math.round(probability * 10)));
}

export function compareRows(change: ScenarioResultOut, nothing: ScenarioResultOut, horizon: number, currency: string): CompareRow[] {
  const money = (v: number) => formatMoney(v, currency);
  const a = change.summary;
  const b = nothing.summary;
  const ahead = aheadOf10(a.prob_beats_baseline_profit);
  const rows: CompareRow[] = [
    { label: `What you keep over ${horizon} months (most likely)`, withChange: money(a.total_profit_p50), without: money(b.total_profit_p50) },
    {
      label: "Bad case to good case",
      withChange: `${money(a.total_profit_p10)} to ${money(a.total_profit_p90)}`,
      without: `${money(b.total_profit_p10)} to ${money(b.total_profit_p90)}`,
    },
    { label: "Cash in the bank at the end", withChange: money(a.end_cash_p50), without: money(b.end_cash_p50) },
    { label: "Regular customers at the end", withChange: formatCount(a.end_customers_p50), without: formatCount(b.end_customers_p50) },
  ];
  if (ahead !== null) rows.push({ label: "Comes out ahead of changing nothing", withChange: `${ahead} of 10 possible futures`, without: "-" });
  return rows;
}

// ---------- a chart that prints ----------

export interface PlanRow {
  label: string;
  p10: number;
  p50: number;
  p90: number;
  baseline?: number;
}

export interface ChartGeometry {
  band: string; // polygon points for the bad-to-good area
  median: string; // polyline points
  baseline: string | null;
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
}

export const CHART = { width: 720, height: 240, left: 76, right: 14, top: 12, bottom: 30 } as const;

/** Turns the rows into drawing coordinates for a fixed-size SVG (which then scales to any width, on screen and on paper). */
export function chartGeometry(rows: PlanRow[]): ChartGeometry {
  const values = rows.flatMap((r) => [r.p10, r.p90, ...(r.baseline !== undefined ? [r.baseline] : [])]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const w = CHART.width - CHART.left - CHART.right;
  const h = CHART.height - CHART.top - CHART.bottom;
  const x = (i: number) => CHART.left + (rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w);
  const y = (v: number) => CHART.top + (1 - (v - lo) / (hi - lo)) * h;
  const pt = (i: number, v: number) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  const upper = rows.map((r, i) => pt(i, r.p90));
  const lower = rows.map((r, i) => pt(i, r.p10)).reverse();
  const mid = Math.floor((rows.length - 1) / 2);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const hasBaseline = rows.every((r) => r.baseline !== undefined);
  return {
    band: [...upper, ...lower].join(" "),
    median: rows.map((r, i) => pt(i, r.p50)).join(" "),
    baseline: hasBaseline ? rows.map((r, i) => pt(i, r.baseline as number)).join(" ") : null,
    yTicks: ticks.map((v) => ({ y: y(v), value: v })),
    xTicks: [
      { x: x(0), label: rows[0].label, anchor: "start" },
      { x: x(mid), label: rows[mid].label, anchor: "middle" },
      { x: x(rows.length - 1), label: rows[rows.length - 1].label, anchor: "end" },
    ],
  };
}
