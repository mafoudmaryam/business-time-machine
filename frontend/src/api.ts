/**
 * Single typed client for the backend API. Types below mirror backend/app/schemas.py.
 *
 * Convention: anything the backend stores as a 0-1 ratio (cogs_ratio, churn_rate,
 * annual_rate) is shown to the user as a 0-100 percentage. The percent<->ratio
 * conversion happens only in this file, via percentToRatio/ratioToPercent, so no
 * component ever has to remember which shape a number is in.
 */
import type { DecisionType } from "./constants";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new ApiError(0, "Could not reach the API. Is the backend running on " + API_BASE_URL + "?");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((e: { msg: string }) => e.msg).join("; ");
    } catch {
      /* body wasn't JSON -- fall back to statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- percent <-> ratio ----------

export function percentToRatio(percent: number): number {
  return Math.round(percent * 1e4) / 1e6;
}

export function ratioToPercent(ratio: number): number {
  return Math.round(ratio * 1e6) / 1e4;
}

// ---------- businesses ----------

export interface BaselineFormValues {
  customers: number;
  cash: number;
  staff_fte: number;
  avg_ticket: number;
  visits_per_regular: number;
  walk_in_visits: number;
  cogs_ratio: number; // percent, 0-100
  wage_per_fte: number;
  fixed_costs: number;
  marketing: number;
  churn_rate: number; // percent, 0-100
  seats: number;
  open_days: number;
}

export const DEFAULT_BASELINE_FORM: BaselineFormValues = {
  customers: 900,
  cash: 25_000,
  staff_fte: 5,
  avg_ticket: 6.5,
  visits_per_regular: 6,
  walk_in_visits: 2_500,
  cogs_ratio: 30,
  wage_per_fte: 3_000,
  fixed_costs: 15_000,
  marketing: 400,
  churn_rate: 5,
  seats: 35,
  open_days: 28,
};

export interface BaselineIn {
  customers: number;
  cash: number;
  staff_fte: number;
  avg_ticket: number;
  visits_per_regular: number;
  walk_in_visits: number;
  cogs_ratio: number; // ratio, 0-1
  wage_per_fte: number;
  fixed_costs: number;
  marketing: number;
  churn_rate: number; // ratio, 0-1
  seats: number;
  open_days: number;
}

export interface BaselineOut extends BaselineIn {
  id: number;
  created_at: string;
}

export interface BusinessOut {
  id: number;
  name: string;
  industry: string;
  currency: string;
  created_at: string;
  baseline: BaselineOut | null;
}

function baselineFormToApi(form: BaselineFormValues): BaselineIn {
  return { ...form, cogs_ratio: percentToRatio(form.cogs_ratio), churn_rate: percentToRatio(form.churn_rate) };
}

/** Accepts either a saved BaselineOut or an industry's plain default_baseline --
 * both are the same ratio-based shape. */
export function baselineApiToForm(baseline: BaselineIn): BaselineFormValues {
  return { ...baseline, cogs_ratio: ratioToPercent(baseline.cogs_ratio), churn_rate: ratioToPercent(baseline.churn_rate) };
}

export function listBusinesses(): Promise<BusinessOut[]> {
  return request("/businesses");
}

export function getBusiness(businessId: number): Promise<BusinessOut> {
  return request(`/businesses/${businessId}`);
}

export function createBusiness(
  name: string,
  industry: string,
  currency: string,
  baseline: BaselineFormValues,
): Promise<BusinessOut> {
  return request("/businesses", {
    method: "POST",
    body: JSON.stringify({ name, industry, currency, baseline: baselineFormToApi(baseline) }),
  });
}

// ---------- industries ----------

export interface IndustryOut {
  id: string;
  display_name: string;
  customer_noun: string;
  staff_noun: string;
  capacity_label: string;
  default_baseline: BaselineIn; // ratio-based, same shape as BaselineOut minus id/created_at
  field_labels: Record<string, string>;
}

export function listIndustries(): Promise<IndustryOut[]> {
  return request("/industries");
}

// ---------- scenarios / decisions ----------

export interface DecisionFormValues {
  type: DecisionType;
  start_month: number;
  value: number;
  unit: string;
  loan_months?: number;
  annual_rate?: number; // percent, 0-100
  capacity_pct?: number; // already a plain percentage number for the engine -- not converted
  cogs_ratio?: number; // percent, 0-100
  investment?: number;
  source: "user" | "ai";
  confirmed: boolean;
}

interface DecisionIn {
  type: string;
  start_month: number;
  value: number;
  unit: string;
  loan_months?: number;
  annual_rate?: number; // ratio, 0-1
  capacity_pct?: number;
  cogs_ratio?: number; // ratio, 0-1
  investment?: number;
  source: string;
  confirmed: boolean;
}

export interface DecisionOut {
  id: number;
  type: string;
  start_month: number;
  value: number;
  unit: string;
  extra: Record<string, number>;
  source: string;
  confirmed: boolean;
}

export interface ScenarioOut {
  id: number;
  business_id: number;
  name: string;
  parent_scenario_id: number | null;
  parent_scenario_name: string | null;
  created_at: string;
  decisions: DecisionOut[];
}

function decisionFormToApi(form: DecisionFormValues): DecisionIn {
  const out: DecisionIn = {
    type: form.type,
    start_month: form.start_month,
    value: form.value,
    unit: form.unit,
    source: form.source,
    confirmed: form.confirmed,
  };
  if (form.loan_months !== undefined) out.loan_months = form.loan_months;
  if (form.annual_rate !== undefined) out.annual_rate = percentToRatio(form.annual_rate);
  if (form.capacity_pct !== undefined) out.capacity_pct = form.capacity_pct;
  if (form.cogs_ratio !== undefined) out.cogs_ratio = percentToRatio(form.cogs_ratio);
  if (form.investment !== undefined) out.investment = form.investment;
  return out;
}

/** Used by "duplicate as new version": turns a saved decision back into an editable,
 * unconfirmed form (values may have changed, so it must be re-confirmed). */
export function decisionOutToForm(d: DecisionOut): DecisionFormValues {
  const extra = d.extra ?? {};
  const form: DecisionFormValues = {
    type: d.type as DecisionType,
    start_month: d.start_month,
    value: d.value,
    unit: d.unit,
    source: "user",
    confirmed: false,
  };
  if ("loan_months" in extra) form.loan_months = extra.loan_months;
  if ("annual_rate" in extra) form.annual_rate = ratioToPercent(extra.annual_rate);
  if ("capacity_pct" in extra) form.capacity_pct = extra.capacity_pct;
  if ("cogs_ratio" in extra) form.cogs_ratio = ratioToPercent(extra.cogs_ratio);
  if ("investment" in extra) form.investment = extra.investment;
  return form;
}

export function listScenarios(businessId: number): Promise<ScenarioOut[]> {
  return request(`/businesses/${businessId}/scenarios`);
}

export function getScenario(scenarioId: number): Promise<ScenarioOut> {
  return request(`/scenarios/${scenarioId}`);
}

export function createScenario(
  businessId: number,
  name: string,
  decisions: DecisionFormValues[],
  parentScenarioId?: number,
): Promise<ScenarioOut> {
  return request(`/businesses/${businessId}/scenarios`, {
    method: "POST",
    body: JSON.stringify({
      name,
      parent_scenario_id: parentScenarioId ?? null,
      decisions: decisions.map(decisionFormToApi),
    }),
  });
}

// ---------- simulations ----------

export interface MetricBands {
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface ScenarioSummary {
  total_profit_p10: number;
  total_profit_p50: number;
  total_profit_p90: number;
  end_cash_p50: number;
  min_cash_p10: number;
  prob_cash_negative: number;
  first_month_cash_risk_10pct: number | null;
  end_customers_p50: number;
  avg_service_quality_p50: number;
  prob_beats_baseline_profit?: number;
  profit_vs_baseline_p50?: number;
}

export interface ScenarioResultOut {
  scenario_id: number | null;
  scenario_name: string;
  bands: Record<string, MetricBands>;
  summary: ScenarioSummary;
}

export interface SimulationRunOut {
  id: number;
  business_id: number;
  engine_version: string;
  seed: number;
  iterations: number;
  horizon: number;
  created_at: string;
  results: ScenarioResultOut[];
}

export interface SimulationRunSummaryOut {
  id: number;
  business_id: number;
  engine_version: string;
  seed: number;
  iterations: number;
  horizon: number;
  created_at: string;
  scenario_names: string[];
}

export function simulateBusiness(
  businessId: number,
  scenarioIds: number[],
  horizon: number,
  iterations = 1000,
  seed?: number,
): Promise<SimulationRunOut> {
  return request(`/businesses/${businessId}/simulate`, {
    method: "POST",
    body: JSON.stringify({ scenario_ids: scenarioIds, horizon, iterations, seed: seed ?? null }),
  });
}

export function listSimulationRuns(businessId: number): Promise<SimulationRunSummaryOut[]> {
  return request(`/businesses/${businessId}/simulation_runs`);
}

export function getSimulationRun(runId: number): Promise<SimulationRunOut> {
  return request(`/simulation_runs/${runId}`);
}

// ---------- AI coach ----------

export interface CoachStatus {
  enabled: boolean;
  mode: string | null; // only filled in when the server allows showing it
}

/** All numbers come from the engine's own simulation of the idea. */
export interface IdeaResult {
  profit_change_most_likely: number;
  beats_change_nothing_of_10: number;
  cash_runs_out_of_10: number;
  profit_bad_case: number;
  profit_most_likely: number;
  profit_good_case: number;
}

/** Flat decision shape of the backend's DECISIONS_JSON_SCHEMA (ratios, not percentages). */
export interface IdeaDecision {
  type: string;
  start_month: number;
  value: number;
  unit: string;
  loan_months?: number;
  annual_rate?: number;
  capacity_pct?: number;
  cogs_ratio?: number;
  investment?: number;
}

export interface CoachIdea {
  title: string;
  why: string;
  builds_on: string; // a scenario name from the run, or "baseline"
  builds_on_scenario_id: number | null;
  decisions: IdeaDecision[];
  decision_texts: string[];
  result: IdeaResult;
}

export interface CoachOut {
  mode: string;
  model: string | null;
  fallback: boolean;
  headline: string;
  what_happens: string;
  why: string;
  watch_out: string[];
  ideas: CoachIdea[];
  generated_at: string;
}

export interface AskOut {
  answer: string;
  mode: string;
  fallback: boolean;
}

export function getCoachStatus(): Promise<CoachStatus> {
  return request("/coach/status");
}

export function requestCoach(runId: number): Promise<CoachOut> {
  return request(`/simulation_runs/${runId}/coach`, { method: "POST" });
}

export function askCoach(runId: number, question: string): Promise<AskOut> {
  return request(`/simulation_runs/${runId}/ask`, { method: "POST", body: JSON.stringify({ question }) });
}

// ---------- starting-month preview (setup wizard) ----------

export interface StartingMonth {
  sales: number;
  ingredient_costs: number;
  staff_costs: number;
  rent_and_other_costs: number;
  marketing: number;
  costs: number;
  profit: number;
}

/** The engine's month 1 for numbers that are not saved yet. The frontend never does this math. */
export function previewStartingMonth(industryId: string, baseline: BaselineFormValues): Promise<StartingMonth> {
  return request(`/industries/${industryId}/preview`, {
    method: "POST",
    body: JSON.stringify(baselineFormToApi(baseline)),
  });
}
