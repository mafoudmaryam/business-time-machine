import { decisionOutToForm, type ScenarioOut } from "../api";
import { decisionSummary } from "./decisionSummary";

/** "Price rise v3" -> { base: "Price rise", version: 3 }; a name with no suffix is version 1. */
export function parseVersion(name: string): { base: string; version: number } {
  const m = name.trim().match(/^(.*?)\s+v(\d+)$/i);
  return m && m[1] ? { base: m[1].trim(), version: Number(m[2]) } : { base: name.trim(), version: 1 };
}

export function needsCheck(s: ScenarioOut): boolean {
  return s.decisions.some((d) => !d.confirmed);
}

function isNewer(a: ScenarioOut, b: ScenarioOut): boolean {
  const [va, vb] = [parseVersion(a.name).version, parseVersion(b.name).version];
  return va !== vb ? va > vb : a.id > b.id;
}

/** The newest version of each scenario family is shown by default; earlier versions sit behind a toggle. */
export function splitVersions(scenarios: ScenarioOut[]): { latest: ScenarioOut[]; older: ScenarioOut[] } {
  const newest = new Map<string, ScenarioOut>();
  for (const s of scenarios) {
    const key = parseVersion(s.name).base.toLowerCase();
    const best = newest.get(key);
    if (!best || isNewer(s, best)) newest.set(key, s);
  }
  const keep = new Set([...newest.values()].map((s) => s.id));
  return { latest: scenarios.filter((s) => keep.has(s.id)), older: scenarios.filter((s) => !keep.has(s.id)) };
}

/** The plain-language sentences for a scenario's decisions, one per decision. */
export function scenarioSentences(s: ScenarioOut, staffNoun: string, currency: string): string[] {
  return s.decisions.map((d) => decisionSummary(decisionOutToForm(d), staffNoun, currency));
}
