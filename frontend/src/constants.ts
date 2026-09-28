/** Fixed chart/legend colors: index 0 is always "if you change nothing". */
export const SCENARIO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

export const MAX_SCENARIOS_PER_RUN = 3;

/** Offered in the setup wizard's currency picker; USD is the default (the
 * example numbers throughout are for a typical small US business). Any valid
 * ISO 4217 code works with the backend -- this list is just what's offered. */
export const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "AUD", "CAD", "CHF", "INR", "SGD", "HKD", "NZD", "MXN", "BRL", "KRW", "ZAR"];

export type DecisionType = "price" | "hiring" | "marketing" | "hours" | "menu" | "investment";

export const DECISION_TYPES: DecisionType[] = ["price", "hiring", "marketing", "hours", "menu", "investment"];

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  price: "Price change",
  hiring: "Hiring / layoffs",
  marketing: "Marketing spend",
  hours: "Opening hours",
  menu: "Menu change",
  investment: "Investment / equipment",
};

export const DECISION_TYPE_HELP: Record<DecisionType, string> = {
  price: "Change the average ticket price, either by a percentage or to a new absolute price.",
  hiring: "Add or remove staff. Two people working half-time each count as one full-time hire.",
  marketing: "Change monthly marketing spend, either by a percentage or to a new absolute amount.",
  hours: "Change how many days per month the business is open.",
  menu: "Reprice or add menu items (an upsell), optionally with a new ingredient-cost share and a one-off setup cost.",
  investment: "A one-off purchase, optionally financed with a loan, that may also add serving capacity.",
};

/** Money units use "{CUR}" as a placeholder -- see lib/format.ts#formatUnit,
 * which substitutes the business's own currency symbol. */
export interface FieldSpec {
  key: string;
  label: string;
  help: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
  isPercent?: boolean;
}

export const BASELINE_STEPS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: "Customers & sales",
    fields: [
      { key: "customers", label: "Regular customers", help: "How many distinct regulars visit in a typical month.", unit: "customers", min: 0, step: 10 },
      { key: "visits_per_regular", label: "Visits per regular", help: "How many times a regular visits per month, on average.", unit: "visits/month", min: 0, step: 0.5 },
      { key: "walk_in_visits", label: "Walk-in visits", help: "Visits per month from people who aren't regulars.", unit: "visits/month", min: 0, step: 50 },
      { key: "churn_rate", label: "Regulars who stop coming each month", help: "On average, this share of your regulars won't return the next month.", unit: "%", min: 0, max: 100, step: 1, isPercent: true },
      { key: "avg_ticket", label: "Average sale per visit", help: "How much a typical customer spends in one visit.", unit: "{CUR}/visit", min: 0, step: 0.1 },
      { key: "seats", label: "Seats", help: "Physical seating or counter capacity, if relevant to this business.", unit: "seats", min: 1, step: 1 },
    ],
  },
  {
    title: "Costs & staff",
    fields: [
      { key: "staff_fte", label: "Full-time staff", help: "Total staffing level. Two people working half-time each count as one.", unit: "full-time equivalent", min: 0, step: 0.5 },
      { key: "wage_per_fte", label: "Pay per full-time staff member", help: "Fully-loaded monthly cost (wages, taxes, benefits) of one full-time staff member.", unit: "{CUR}/month", min: 0, step: 100 },
      { key: "cogs_ratio", label: "Ingredient costs", help: "Ingredients and packaging, as a share of what you sell them for.", unit: "% of sales", min: 0, max: 99, step: 1, isPercent: true },
      { key: "fixed_costs", label: "Fixed costs", help: "Rent, utilities and other costs that don't vary with sales.", unit: "{CUR}/month", min: 0, step: 100 },
      { key: "marketing", label: "Marketing spend", help: "Current monthly marketing budget.", unit: "{CUR}/month", min: 0, step: 50 },
      { key: "open_days", label: "Open days", help: "How many days per month the business opens.", unit: "days/month", min: 1, max: 31, step: 1 },
    ],
  },
  {
    title: "Cash",
    fields: [
      { key: "cash", label: "Starting cash", help: "Cash on hand today -- the engine tracks this month by month.", unit: "{CUR}", min: 0, step: 500 },
    ],
  },
];
