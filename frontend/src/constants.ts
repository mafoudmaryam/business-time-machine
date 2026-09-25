/** Change this to switch the whole app's currency symbol. */
export const CURRENCY = "¥";

/** Fixed chart/legend colors: index 0 is always the baseline. */
export const SCENARIO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

export const MAX_SCENARIOS_PER_RUN = 3;

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
  hiring: "Add or remove staff, in full-time-equivalent (FTE) headcount.",
  marketing: "Change monthly marketing spend, either by a percentage or to a new absolute amount.",
  hours: "Change how many days per month the café is open.",
  menu: "Reprice or add menu items (an upsell), optionally with a new ingredient-cost ratio and a one-off setup cost.",
  investment: "A one-off purchase, optionally financed with a loan, that may also add serving capacity.",
};

/** Money units use "{CUR}" as a placeholder for CURRENCY -- see lib/format.ts#formatUnit. */
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
      { key: "churn_rate", label: "Monthly churn", help: "Share of regulars who stop coming back each month.", unit: "%", min: 0, max: 100, step: 1, isPercent: true },
      { key: "avg_ticket", label: "Average ticket", help: "Average amount spent per visit.", unit: "{CUR}/visit", min: 0, step: 0.1 },
      { key: "seats", label: "Seats", help: "Physical seating or counter capacity, if relevant to this business.", unit: "seats", min: 1, step: 1 },
    ],
  },
  {
    title: "Costs & staff",
    fields: [
      { key: "staff_fte", label: "Staff", help: "Total staffing level, in full-time-equivalent headcount.", unit: "FTE", min: 0, step: 0.5 },
      { key: "wage_per_fte", label: "Wage per FTE", help: "Fully-loaded monthly cost of one full-time staff member.", unit: "{CUR}/FTE/month", min: 0, step: 100 },
      { key: "cogs_ratio", label: "Cost of goods (COGS)", help: "Ingredient and packaging cost as a share of revenue.", unit: "%", min: 0, max: 99, step: 1, isPercent: true },
      { key: "fixed_costs", label: "Fixed costs", help: "Rent, utilities and other costs that don't vary with sales.", unit: "{CUR}/month", min: 0, step: 100 },
      { key: "marketing", label: "Marketing spend", help: "Current monthly marketing budget.", unit: "{CUR}/month", min: 0, step: 50 },
      { key: "open_days", label: "Open days", help: "How many days per month the café opens.", unit: "days/month", min: 1, max: 31, step: 1 },
    ],
  },
  {
    title: "Cash",
    fields: [
      { key: "cash", label: "Starting cash", help: "Cash on hand today -- the engine tracks this month by month.", unit: "{CUR}", min: 0, step: 500 },
    ],
  },
];
