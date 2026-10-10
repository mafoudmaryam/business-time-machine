import type { GuideAnswers, GuideCountry, GuideLine, GuideSource, Trio } from "../api";
import { formatMoney } from "./format";

/** Words and shapes for the "I don't have a business yet" guide. Formatting and choosing text only: every number on the plan
 *  page comes from the engine (btm_engine.startup), and no AI is involved anywhere. */

export const DISCLAIMER = "A rough estimate, not advice. Real costs depend on your city and your choices.";
export const STARTING_PICTURE = "This is a starting picture. It assumes your business is open and running smoothly.";
export const STANDING_LINE = "Scenarios, not forecasts. Not legal, tax or financial advice.";
export const NOT_AFFILIATED = "We are not affiliated with these sites, receive nothing from them, and do not endorse them.";

// ---------- the nine screens ----------

export const GUIDE_STEPS = ["type", "country", "budget", "premises", "size", "serve", "people", "customers", "timeline"] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

export interface GuideDraft {
  business_type: string | null;
  country: string | null;
  currency: string;
  budget: number; // NaN while empty: "not sure yet"
  premises: string | null;
  rent: number;
  size: string | null;
  menu: string | null;
  alcohol: string | null;
  people: number;
  customers_per_day: number;
  avg_spend: number;
  ingredient_share: number;
  timeline: string | null;
}

export const EMPTY_DRAFT: GuideDraft = {
  business_type: null, country: null, currency: "USD", budget: NaN, premises: null, rent: NaN, size: null, menu: null,
  alcohol: null, people: NaN, customers_per_day: NaN, avg_spend: NaN, ingredient_share: NaN, timeline: null,
};

export const STEP_TITLES: Record<GuideStep, { question: string; why: string }> = {
  type: { question: "What would you like to open?", why: "We use it to pick the right numbers and wording." },
  country: { question: "Which country will you open in?", why: "Costs and rules differ by country. We ask for the country only, not your city." },
  budget: { question: "How much money can you put in?", why: "We compare it with the plan. Leave it empty if you are not sure yet." },
  premises: { question: "Will you rent, own, or start smaller?", why: "It decides which building costs are included." },
  size: { question: "How big will it be?", why: "A stall or kiosk costs very differently from a place with seats." },
  serve: { question: "What will you serve?", why: "A full kitchen and alcohol bring more equipment and paperwork." },
  people: { question: "How many people will work there?", why: "Count yourself as one, and two part-timers as one. It is the biggest running cost." },
  customers: { question: "On a normal day, how many customers do you hope for, and what will one spend?", why: "These are your own guesses and we show them as yours. Leave a box empty if you are not sure." },
  timeline: { question: "When do you hope to open?", why: "It only changes the order of the checklist, never a cost." },
};

export const PREMISES_OPTIONS = [
  { id: "ready", label: "Rent a ready-to-use shop", help: "You move in with little building work." },
  { id: "fit_out", label: "Rent an empty space and fit it out", help: "You pay for building work too." },
  { id: "own", label: "I already own the place", help: "No rent and no deposit." },
  { id: "mobile", label: "Start with a stall, cart, kiosk or home kitchen", help: "A smaller first step." },
] as const;

export const SIZE_OPTIONS = [
  { id: "tiny", label: "Tiny", help: "A stall, cart, kiosk or home kitchen" },
  { id: "small", label: "Small", help: "A takeaway counter, up to about 20 seats" },
  { id: "medium", label: "Medium", help: "About 20 to 50 seats" },
  { id: "large", label: "Large", help: "Over 50 seats" },
] as const;

export const MENU_OPTIONS = [
  { id: "simple", label: "A short, simple menu" },
  { id: "full", label: "A full menu with a kitchen" },
] as const;

export const ALCOHOL_OPTIONS = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "unsure", label: "Not sure" },
] as const;

export const TIMELINE_OPTIONS = [
  { id: "3m", label: "Within 3 months" },
  { id: "6m", label: "In 3 to 6 months" },
  { id: "12m", label: "In 6 to 12 months" },
  { id: "exploring", label: "Just exploring" },
] as const;

export function countryById(countries: GuideCountry[], id: string | null): GuideCountry | undefined {
  return countries.find((c) => c.id === id);
}

/** Countries where the person types their own ingredient share (no published figure). */
export function needsOwnNumbers(country: GuideCountry | undefined): boolean {
  return country?.mode === "own_numbers";
}

const finite = (n: number) => Number.isFinite(n);

export type StepErrors = Partial<Record<keyof GuideDraft, string>>;

/** What is wrong on this screen, in plain words. Empty means the person can go on. Only choices and the head count are required. */
export function validateStep(step: GuideStep, d: GuideDraft): StepErrors {
  const errors: StepErrors = {};
  const optional = (key: "budget" | "rent" | "customers_per_day" | "avg_spend" | "ingredient_share", what: string, max: number, strict = false) => {
    const v = d[key];
    if (Number.isNaN(v)) return;
    if (!finite(v)) errors[key] = `${what} must be a number.`;
    else if (v < 0 || (strict && v === 0)) errors[key] = `${what} must be more than zero.`;
    else if (v > max) errors[key] = `${what} is too large.`;
  };
  switch (step) {
    case "type":
      if (!d.business_type) errors.business_type = "Please choose what you would like to open.";
      break;
    case "country":
      if (!d.country) errors.country = "Please choose a country.";
      break;
    case "budget":
      optional("budget", "Your budget", 1e10);
      break;
    case "premises":
      if (!d.premises) errors.premises = "Please choose one.";
      optional("rent", "The rent", 1e8);
      break;
    case "size":
      if (!d.size) errors.size = "Please choose a size.";
      break;
    case "serve":
      if (!d.menu) errors.menu = "Please choose a menu.";
      if (!d.alcohol) errors.alcohol = "Please choose one.";
      break;
    case "people":
      if (Number.isNaN(d.people)) errors.people = "Please tell us how many people will work there.";
      else if (!finite(d.people) || d.people <= 0) errors.people = "It must be more than zero.";
      else if (d.people > 500) errors.people = "That is too many for this guide.";
      break;
    case "customers":
      optional("customers_per_day", "The number of customers", 20_000, true);
      optional("avg_spend", "What one customer spends", 100_000, true);
      if (!Number.isNaN(d.ingredient_share) && (!finite(d.ingredient_share) || d.ingredient_share < 0 || d.ingredient_share >= 100)) {
        errors.ingredient_share = "Please give a share between 0 and 99.";
      }
      break;
    case "timeline":
      if (!d.timeline) errors.timeline = "Please choose one.";
      break;
  }
  return errors;
}

const orNull = (n: number): number | null => (Number.isNaN(n) ? null : n);

export function toAnswers(d: GuideDraft): GuideAnswers {
  return {
    business_type: d.business_type, country: d.country, currency: d.currency || null, budget: orNull(d.budget), premises: d.premises,
    rent: orNull(d.rent), size: d.size, menu: d.menu, alcohol: d.alcohol,
    people: orNull(d.people), customers_per_day: orNull(d.customers_per_day), avg_spend: orNull(d.avg_spend),
    ingredient_share: orNull(d.ingredient_share), timeline: d.timeline,
  };
}

export function draftFromAnswers(a: GuideAnswers): GuideDraft {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? NaN : v);
  return {
    business_type: a.business_type, country: a.country, currency: a.currency ?? "USD", budget: n(a.budget), premises: a.premises,
    rent: n(a.rent), size: a.size, menu: a.menu, alcohol: a.alcohol, people: n(a.people), customers_per_day: n(a.customers_per_day),
    avg_spend: n(a.avg_spend), ingredient_share: n(a.ingredient_share), timeline: a.timeline,
  };
}

export function stepFromParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= GUIDE_STEPS.length ? n - 1 : 0;
}

const DRAFT_KEY = "btm.guideDraft";

/** The half-finished answers are kept in this tab only, so a refresh does not lose them. A convenience: the guide works without it. */
export function saveDraft(d: GuideDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, budget: orNull(d.budget), rent: orNull(d.rent), people: orNull(d.people), customers_per_day: orNull(d.customers_per_day), avg_spend: orNull(d.avg_spend), ingredient_share: orNull(d.ingredient_share) }));
  } catch {
    /* private window or blocked storage: carry on without it */
  }
}

export function loadDraft(): GuideDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as GuideAnswers;
    return draftFromAnswers(a);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}

// ---------- showing figures ----------

export function money(value: number, currency: string): string {
  return formatMoney(value, currency);
}

/** Whole amounts, except small ones such as an hourly wage, which keep their cents ($15.24, not $15). */
function exact(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function moneyRange(low: number, high: number, currency: string, cents = false): string {
  const f = (v: number) => (cents ? exact(v, currency) : formatMoney(v, currency));
  return low === high ? f(low) : `${f(low)} to ${f(high)}`;
}

const SUFFIX: Record<string, string> = { per_month: " a month", per_hour: " an hour", per_year: " a year", one_off: "" };

function plain(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
}

/** One sourced figure in words: "$30,000 to $150,000", "$15.24 an hour", "32.4% of sales", "28 days". */
export function lineValue(line: Pick<GuideLine, "low" | "high" | "unit" | "currency">): string {
  const { low, high, unit, currency } = line;
  if (unit === "percent_of_sales" || unit === "percent") {
    const text = low === high ? `${plain(low)}%` : `${plain(low)}% to ${plain(high)}%`;
    return unit === "percent_of_sales" ? `${text} of sales` : text;
  }
  if (unit === "days") return low === high ? `${plain(low)} days` : `${plain(low)} to ${plain(high)} days`;
  if (unit === "months") return low === high ? `${plain(low)} months` : `${plain(low)} to ${plain(high)} months`;
  if (unit === "hours_per_month") return `${plain(low)} hours a month`;
  if (unit === "fraction") return `${plain(Math.round(low * 100))}% of the rent`;
  if (currency) return moneyRange(low, high, currency, unit === "per_hour") + (SUFFIX[unit] ?? "");
  return low === high ? plain(low) : `${plain(low)} to ${plain(high)}`;
}

export function trioText(t: Trio, currency: string): string {
  return moneyRange(t.low, t.high, currency);
}

/** Says what kind of number a line is, so one figure is never mistaken for a range. */
export function basisText(basis: string | null): string | null {
  switch (basis) {
    case "single_value": return "one figure from one guide";
    case "median": return "a median; the source gives no range";
    case "legal_minimum": return "the legal minimum, not typical pay";
    case "average": return "an average";
    default: return null;
  }
}

export function dateText(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function newestCheck(sources: GuideSource[]): string | null {
  const dates = sources.map((s) => s.last_checked).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

const TYPE_WORDS: Record<string, string> = { cafe: "café", restaurant: "restaurant", bakery: "bakery" };

export function typeWord(type: string): string {
  return TYPE_WORDS[type] ?? "business";
}

export function planTitle(type: string, countryName: string): string {
  return `A small ${typeWord(type)} in ${countryName === "Somewhere else" ? "your country" : (countryName.startsWith("United") ? "the " + countryName : countryName)}`;
}

export const NEEDS_WORDS: Record<string, string> = {
  rent: "your monthly rent",
  ingredient_share: "your ingredient share of sales",
  pay: "pay (we have no sourced figure for your country)",
  avg_spend: "what one customer spends",
  customers_per_day: "how many customers you hope for",
};

export const VERDICT_TILE: Record<string, { title: string; tone: "good" | "careful" | "quiet" }> = {
  enough: { title: "Looks enough", tone: "good" },
  tight: { title: "Looks tight", tone: "careful" },
  not_enough: { title: "Below the low end", tone: "careful" },
  unknown: { title: "Not compared", tone: "quiet" },
};
