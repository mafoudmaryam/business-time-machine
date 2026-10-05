import type { HowOut } from "../api";
import { formatAssumptionValue } from "./todayView";

/** The wording on "How we worked it out". Plain sentences, no equations, no jargon. The only figures in it come from the
 *  stored run behind the Today page (how many futures, how many months, which program version and seed). */

/** Where a guessed number can be changed: the "What we assumed" list on Today. */
export const CHANGE_ASSUMPTION_LINK = "/today#assumed";

export function howMadeSentences(run: HowOut["run"]): string[] {
  return [
    `We take your numbers and run them month by month for the next ${run.horizon} months, again and again: ${run.iterations.toLocaleString()} times. Each time, a few things are nudged a little (how much customers react to a price change, how many regulars drift away), so you get ${run.iterations.toLocaleString()} possible futures instead of one.`,
    "The solid line on the charts is the most likely path. The shaded area runs from a bad case to a good case: about 8 in 10 of those futures stay inside it.",
    "Every change you try is compared with “if you change nothing”, using the very same futures, so the difference you see is fair.",
    `Each answer is saved with its settings (program version ${run.engine_version}, ${run.iterations.toLocaleString()} futures, starting number ${run.seed}), so the same answer can be made again.`,
  ];
}

export const LIMITS: string[] = [
  "How much marketing really brings in new customers. That effect is a rough estimate that has not been checked against real data, so be extra careful with any result that depends on marketing.",
  "Busy and quiet seasons. Every month starts from the same level, so a summer rush or a winter dip is not in the picture yet.",
  "Your town. The numbers we fill in for you are typical for a small café, restaurant or bakery, in US dollars. They are a starting point, not a measurement of your business.",
  "The future. This is a scenario, not a forecast: it shows what could happen if your numbers are about right, not what will happen.",
  "Anything outside the numbers: a new competitor, a road closure, a bad review. Real life has more surprises than any simulation.",
  "This is not financial advice. For a big decision, talk to an accountant or an adviser you trust.",
];

export function formatHowValue(item: { value: number; unit: HowOut["told"][number]["unit"] }, currency: string): string {
  return formatAssumptionValue(item, currency);
}

export const DISCLAIMER = "Scenarios, not forecasts. Built from typical numbers and the ones you gave us. Not financial advice.";
