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

/** A number the app filled in for the owner, and the plain-words rule it came from. */
export interface AssumedField {
  field: string;
  rule: string;
}

export interface BaselineOut extends BaselineIn {
  id: number;
  created_at: string;
  assumed_fields: AssumedField[] | null;
}

export interface BusinessOut {
  id: number;
  name: string;
  industry: string;
  currency: string;
  created_at: string;
  setup_source: string; // full | quick | sample | seed
  is_sample: boolean;
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

/** How the owner confirmed a step (thesis data): ticked one by one, "Confirm all", "Confirm all and save",
 * or by editing it (saving an edit counts as reviewing it). */
export type ConfirmVia = "one_by_one" | "confirm_all" | "confirm_all_on_save" | "edited" | "try_change";

/** Where a step came from when the owner described it in their own words (UI only, never sent to the API). */
export interface StepOrigin {
  interpretationId: number;
  quote: string; // the owner's exact words this step came from ("" when unknown)
  sentence: string; // the plain sentence the app wrote, in the business's own words
  whenLabel: string; // "March 2027 (month 6)"
  group: string | null; // a temporary change is a start step and an end step that share a group
  role: "start" | "end" | null;
  groupSentence: string | null;
}

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
  origin?: StepOrigin; // set on steps that came from "describe it in your own words"
  edited?: boolean; // the owner changed an interpreted step
  confirmedVia?: ConfirmVia; // how it was confirmed (only meaningful while confirmed)
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
  confirmed_via?: string;
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
  if (form.confirmed && form.confirmedVia) out.confirmed_via = form.confirmedVia;
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

export type VerdictKey = "good" | "try" | "risky" | "no";

export interface CoachBar {
  key: string;
  label: string; // plain words, e.g. "Higher prices"
  amount: number; // money: positive helps, negative hurts
}

/** The skimmable part of the card. Decided by rules from the engine's facts -- never by the AI. */
export interface CoachSummaryTile {
  key: "profit" | "cash" | "customers";
  now: number;
  later: number;
}

export interface CoachSummary {
  tiles: CoachSummaryTile[];
  customers_word: string;
  scenario: string;
  verdict: { key: VerdictKey; label: string };
  months: number;
  profit_change: number;
  better_of_10: number | null;
  regulars_change_count: number;
  regulars_change_percent: number;
  bars: CoachBar[];
  risk_flags: string[];
  has_risk: boolean;
}

export interface CoachOut {
  mode: string;
  model: string | null;
  fallback: boolean;
  headline: string;
  what_happens: string;
  why: string;
  watch_out: string[];
  summary: CoachSummary;
  ideas: CoachIdea[];
  generated_at: string;
  /** none = no AI in use; pending = this is the rule-based version and the AI is still writing;
   * done / failed = the AI finished (failed keeps the rule-based version). */
  ai_status: "none" | "pending" | "done" | "failed";
}

export interface AskOut {
  id: number;
  question: string;
  answer: string;
  mode: string; // "template" until an AI answer has replaced the instant one
  fallback: boolean;
  ai_status: "none" | "pending" | "done" | "failed";
  answered: boolean; // false: the rules could not tell, so `suggestions` are offered
  suggestions: string[];
}

export function getCoachStatus(): Promise<CoachStatus> {
  return request("/coach/status");
}

export function requestCoach(runId: number): Promise<CoachOut> {
  return request(`/simulation_runs/${runId}/coach`, { method: "POST" });
}

/** Progress of the coach for a run -- poll this while ai_status is "pending". */
export function getCoach(runId: number): Promise<CoachOut> {
  return request(`/simulation_runs/${runId}/coach`);
}

/** Returns at once with an instant rule-based answer; poll getAsk for the AI's better one. The 15 s limit only
 * guards against a dead server: the request itself is quick. */
export function askCoach(runId: number, question: string): Promise<AskOut> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  return request<AskOut>(`/simulation_runs/${runId}/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

export function getAsk(askId: number): Promise<AskOut> {
  return request(`/asks/${askId}`);
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


// ---------- describe it in your own words ----------

export interface InterpretedDecision extends IdeaDecision {
  source_quote: string;
  sentence: string;
  when_label: string;
  group: string | null;
  role: "start" | "end" | null;
  group_sentence: string | null;
}

export interface InterpretQuestion {
  id: string; // "0:when" -- which step, which missing piece
  slot: string;
  text: string;
  about: string; // the owner's words this question is about
  options: string[] | null; // quick answers
  hint: string;
}

export interface OutOfScope {
  message: string;
  can_do: string[];
  quotes: string[];
}

export interface Interpretation {
  id: number;
  business_id: number;
  text: string;
  status: "pending" | "done";
  provider: string | null;
  fallback: boolean | null;
  decisions: InterpretedDecision[];
  questions: InterpretQuestion[];
  out_of_scope: OutOfScope | null;
  notes: string[];
  month_one: string;
}

export interface InterpretAnswer {
  id: string;
  question: string;
  answer: string;
}

export function interpretText(businessId: number, text: string, answers: InterpretAnswer[] = []): Promise<Interpretation> {
  return request(`/businesses/${businessId}/interpret`, { method: "POST", body: JSON.stringify({ text, answers }) });
}

export function getInterpretation(interpretationId: number): Promise<Interpretation> {
  return request(`/interpretations/${interpretationId}`);
}

/** Tells the server what the owner finally kept, edited or added after the AI's steps (a thesis measure). */
export function logInterpretOutcome(
  interpretationId: number,
  decisions: DecisionFormValues[],
  scenarioId?: number,
): Promise<unknown> {
  return request(`/interpretations/${interpretationId}/outcome`, {
    method: "POST",
    body: JSON.stringify({ decisions: decisions.map(decisionFormToApi), scenario_id: scenarioId ?? null }),
  });
}

/** "Looks right": the owner reviewed the scenario's decisions, so mark them all confirmed. */
export function confirmScenario(scenarioId: number): Promise<ScenarioOut> {
  return request(`/scenarios/${scenarioId}/confirm`, { method: "POST" });
}


// ---------- beginner journey: config, quick start, sample, Today ----------

export interface AppConfig {
  coach_enabled: boolean;
  coach_mode: string | null;
  study_mode: boolean;
}

export function getConfig(): Promise<AppConfig> {
  return request("/config");
}

export interface QuickAnswers {
  customers_per_day: number;
  avg_spend: number;
  monthly_rent: number;
  staff: number;
}

export interface QuickStartOut {
  baseline: BaselineIn;
  assumed: AssumedField[];
  warnings: string[];
  preview: StartingMonth;
}

/** Four easy answers -> all the model's numbers. The conversion is the engine's; nothing is saved. */
export function quickBaseline(industryId: string, answers: QuickAnswers): Promise<QuickStartOut> {
  return request(`/industries/${industryId}/quick_baseline`, { method: "POST", body: JSON.stringify(answers) });
}

export function createQuickBusiness(
  name: string,
  industry: string,
  currency: string,
  quick: QuickStartOut,
): Promise<BusinessOut> {
  return request("/businesses", {
    method: "POST",
    body: JSON.stringify({
      name, industry, currency, baseline: quick.baseline, setup_source: "quick", assumed_fields: quick.assumed,
    }),
  });
}

export function createSampleBusiness(industry: string, currency: string): Promise<BusinessOut> {
  return request("/sample_business", { method: "POST", body: JSON.stringify({ industry, currency }) });
}

export type Unit = "money" | "count" | "percent" | "days" | "number";

export interface Assumption {
  field: string;
  label: string;
  value: number; // percent fields arrive as a 0-1 ratio
  unit: Unit;
  rule: string;
  important: boolean;
}

export interface TodayNote {
  text: string;
  mode: string;
  model: string | null;
  fallback: boolean;
  generated_at: string;
  ai_status: string; // none | pending | done | failed
  ai_started_at: string | null;
}

export interface Band {
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface TodayTiles {
  profit_a_month: number;
  profit_a_month_bad_case: number;
  profit_a_month_good_case: number;
  cash_now: number;
  months_of_bills_covered: number;
  cash_runs_out_of_10: number;
  lowest_cash_amount: number;
  lowest_cash_month: number;
  lowest_cash_month_label: string;
}

export interface TodayOut {
  business_id: number;
  name: string;
  industry: string;
  currency: string;
  is_sample: boolean;
  run_id: number;
  horizon: number;
  engine_version: string;
  seed: number;
  iterations: number;
  month_labels: string[];
  tiles: TodayTiles;
  profit: Band;
  cash: Band;
  note: TodayNote | null; // null: the coach is switched off
  assumptions: Assumption[];
  assumed_by_app: boolean;
}

export function getToday(businessId: number): Promise<TodayOut> {
  return request(`/businesses/${businessId}/today`);
}

export function getTodayNote(businessId: number): Promise<TodayNote> {
  return request(`/businesses/${businessId}/today/note`);
}

/** Change some of the owner's numbers (percent fields as 0-1 ratios, like everything the API stores). */
export function changeNumbers(businessId: number, changes: Partial<BaselineIn>): Promise<BusinessOut> {
  return request(`/businesses/${businessId}/baseline`, { method: "PATCH", body: JSON.stringify(changes) });
}

export interface UiEventIn {
  name: string;
  screen?: string;
  payload?: Record<string, unknown>;
}

export function logEvents(sessionId: string, businessId: number | null, events: UiEventIn[]): Promise<{ stored: number }> {
  return request("/events", { method: "POST", body: JSON.stringify({ session_id: sessionId, business_id: businessId, events }) });
}

// ---------- delete and undo (soft delete on the server) ----------

export interface DeletedOut {
  id: number;
  kind: "business" | "scenario" | "run" | "journal";
  name: string;
  deleted_at: string;
}

export interface ScenarioImpact {
  decisions: number;
  runs: number;
}

export interface BusinessImpact {
  scenarios: number;
  runs: number;
}

export function getScenarioImpact(id: number): Promise<ScenarioImpact> {
  return request(`/scenarios/${id}/impact`);
}

export function getBusinessImpact(id: number): Promise<BusinessImpact> {
  return request(`/businesses/${id}/impact`);
}

export function deleteScenario(id: number): Promise<DeletedOut> {
  return request(`/scenarios/${id}`, { method: "DELETE" });
}

export function restoreScenario(id: number): Promise<ScenarioOut> {
  return request(`/scenarios/${id}/restore`, { method: "POST" });
}

export function deleteRun(id: number): Promise<DeletedOut> {
  return request(`/simulation_runs/${id}`, { method: "DELETE" });
}

export function restoreRun(id: number): Promise<SimulationRunSummaryOut> {
  return request(`/simulation_runs/${id}/restore`, { method: "POST" });
}

export function deleteBusiness(id: number): Promise<DeletedOut> {
  return request(`/businesses/${id}`, { method: "DELETE" });
}

export function restoreBusiness(id: number): Promise<BusinessOut> {
  return request(`/businesses/${id}/restore`, { method: "POST" });
}

// ---------- "Try a change": the quick sketch ----------

export type SketchKind = "price" | "hours" | "hiring" | "marketing";

export interface SketchRequest {
  type: SketchKind;
  amount: number;
  start_month: number; // 1-12
}

export interface StartOption {
  key: string;
  label: string;
  month: number;
  name: string;
}

export function getStartOptions(): Promise<{ options: StartOption[] }> {
  return request("/start_options");
}

export interface SketchPath {
  profit: Band;
  cash: Band;
  customers: Band;
  lowest_cash_amount: number;
  lowest_cash_month: number;
}

/** The answer to a slider position. It is only a sketch: nothing is saved, and the AI never explains it. */
export interface Sketch {
  just_a_sketch: boolean;
  type: SketchKind;
  amount: number;
  start_month: number;
  start_label: string;
  sentence: string;
  engine_version: string;
  seed: number;
  iterations: number;
  horizon: number;
  month_labels: string[];
  extra_profit_per_month: number;
  profit_per_month_with_change: number;
  profit_per_month_without: number;
  visits_change_per_month: number;
  visits_per_month_without: number;
  ahead_of_10: number;
  cash_now: number;
  change: SketchPath;
  baseline: SketchPath;
  example: { before: number; after: number } | null;
}

export function previewChange(businessId: number, body: SketchRequest, signal?: AbortSignal): Promise<Sketch> {
  return request(`/businesses/${businessId}/preview_change`, { method: "POST", body: JSON.stringify(body), signal });
}

// ---------- "How we worked it out" and the share page ----------

/** One number the owner gave us (percent fields arrive as 0-1 ratios, like everywhere else). */
export interface HowItem {
  key: string;
  label: string;
  value: number;
  unit: Unit;
}

export interface HowOut {
  business_id: number;
  name: string;
  industry: string;
  currency: string;
  is_sample: boolean;
  setup_source: string;
  told: HowItem[]; // the owner's own numbers
  assumed: Assumption[]; // the numbers we filled in, each with its rule
  run: { iterations: number; horizon: number; engine_version: string; seed: number };
}

export function getHow(businessId: number): Promise<HowOut> {
  return request(`/businesses/${businessId}/how`);
}

/** The same numbers as Today, without the coach note (so no AI is started). Used by the share page. */
export function getSummary(businessId: number): Promise<TodayOut> {
  return request(`/businesses/${businessId}/summary`);
}

// ---------- journal: what really happened, next to what we expected ----------

export type JournalMetric = "profit" | "cash" | "visits";
export type JournalPosition = "below" | "inside" | "above";

export interface JournalEntryIn {
  month: string; // "YYYY-MM"
  actual_profit: number;
  actual_cash: number;
  actual_visits: number;
  note: string | null;
}

export interface JournalEntryOut {
  id: number;
  business_id: number;
  month: string;
  month_label: string;
  actual_profit: number;
  actual_cash: number;
  actual_visits: number;
  note: string | null;
  created_at: string;
}

export interface JournalComparison {
  metric: JournalMetric;
  actual: number;
  expected_low: number;
  expected: number;
  expected_high: number;
  difference: number;
  percent_difference: number | null;
  position: JournalPosition;
  sentence: string;
}

export interface JournalMonthOut {
  entry: JournalEntryOut;
  has_prediction: boolean;
  prediction_run_id: number | null;
  comparisons: JournalComparison[];
  summary: string;
}

export interface JournalDue {
  month: string;
  month_label: string;
}

export interface JournalAccuracy {
  metric: JournalMetric;
  months: number;
  inside: number;
  below: number;
  above: number;
  mean_difference: number | null;
  mean_abs_percent_difference: number | null;
}

export interface JournalForecastMonth {
  month: string;
  month_label: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface JournalOut {
  business_id: number;
  currency: string;
  is_sample: boolean;
  entries: JournalMonthOut[];
  due: JournalDue[];
  accuracy: JournalAccuracy[];
  forecast: { run_id: number; months: JournalForecastMonth[] } | null;
}

export function getJournal(businessId: number): Promise<JournalOut> {
  return request(`/businesses/${businessId}/journal`);
}

/** Saves a month; saving a month that already has an entry edits it. */
export function saveJournalEntry(businessId: number, entry: JournalEntryIn): Promise<JournalMonthOut> {
  return request(`/businesses/${businessId}/journal`, { method: "POST", body: JSON.stringify(entry) });
}

export function deleteJournalEntry(businessId: number, month: string): Promise<DeletedOut> {
  return request(`/businesses/${businessId}/journal/${month}`, { method: "DELETE" });
}

export function restoreJournalEntry(businessId: number, month: string): Promise<JournalMonthOut> {
  return request(`/businesses/${businessId}/journal/${month}/restore`, { method: "POST" });
}
