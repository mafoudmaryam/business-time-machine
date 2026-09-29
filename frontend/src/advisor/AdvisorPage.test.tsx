import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { AdvisorPage } from "./AdvisorPage";
import { resetCoachStore } from "./coachStore";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listBusinesses: vi.fn(),
    listIndustries: vi.fn(),
    listScenarios: vi.fn(),
    createBusiness: vi.fn(),
    createScenario: vi.fn(),
    simulateBusiness: vi.fn(),
    previewStartingMonth: vi.fn(),
    getCoachStatus: vi.fn(),
    requestCoach: vi.fn(),
    getCoach: vi.fn(),
    askCoach: vi.fn(),
    getScenario: vi.fn(),
    getSimulationRun: vi.fn(),
  };
});

const defaultBaseline = {
  customers: 900, cash: 25000, staff_fte: 5, avg_ticket: 6.5, visits_per_regular: 6, walk_in_visits: 2500,
  cogs_ratio: 0.3, wage_per_fte: 3000, fixed_costs: 15000, marketing: 400, churn_rate: 0.05, seats: 35, open_days: 28,
};

const cafe: api.IndustryOut = {
  id: "cafe",
  display_name: "Café",
  customer_noun: "regulars",
  staff_noun: "barista",
  capacity_label: "visits per staff member per month",
  default_baseline: defaultBaseline,
  field_labels: { customers: "Regulars" },
};

const business: api.BusinessOut = {
  id: 1, name: "Demo Cafe", industry: "cafe", currency: "USD", created_at: "",
  baseline: { ...defaultBaseline, id: 1, created_at: "" },
};

function bands(start: number) {
  const line = Array.from({ length: 24 }, (_, i) => start + i * 100);
  return { p10: line, p50: line, p90: line };
}

const run: api.SimulationRunOut = {
  id: 9, business_id: 1, engine_version: "0.1.0", seed: 1, iterations: 1000, horizon: 24, created_at: "",
  results: [
    {
      scenario_id: null, scenario_name: "baseline", bands: { cash: bands(25000) },
      summary: {
        total_profit_p10: 1, total_profit_p50: 133000, total_profit_p90: 3, end_cash_p50: 4, min_cash_p10: 5,
        prob_cash_negative: 0, first_month_cash_risk_10pct: null, end_customers_p50: 900, avg_service_quality_p50: 1,
      },
    },
    {
      scenario_id: 5, scenario_name: "Raise prices 10% from month 3", bands: { cash: bands(25000) },
      summary: {
        total_profit_p10: 1, total_profit_p50: 151000, total_profit_p90: 3, end_cash_p50: 4, min_cash_p10: 5,
        prob_cash_negative: 0, first_month_cash_risk_10pct: null, end_customers_p50: 866, avg_service_quality_p50: 1,
        prob_beats_baseline_profit: 0.77, profit_vs_baseline_p50: 18000,
      },
    },
  ],
};

const coach: api.CoachOut = {
  mode: "template", model: null as unknown as string, fallback: false,
  headline: "Raising prices looks like a good move.",
  what_happens: "You could make more.",
  why: "Each sale brings in more.",
  watch_out: ["Keep an eye on your regulars."],
  generated_at: "",
  ai_status: "none",
  ideas: [
    {
      title: "Add one more barista", why: "Busy months.", builds_on: "Raise prices 10% from month 3", builds_on_scenario_id: 5,
      decisions: [{ type: "hiring", start_month: 5, value: 1, unit: "fte" }],
      decision_texts: ["Hire 1 full-time staff from month 5"],
      result: { profit_change_most_likely: 1500, beats_change_nothing_of_10: 7, cash_runs_out_of_10: 0, profit_bad_case: 1, profit_most_likely: 2, profit_good_case: 3 },
    },
  ],
};

const savedScenario: api.ScenarioOut = {
  id: 5, business_id: 1, name: "Raise prices 10% from month 3", parent_scenario_id: null, parent_scenario_name: null, created_at: "",
  decisions: [{ id: 1, type: "price", start_month: 3, value: 10, unit: "percent", extra: {}, source: "user", confirmed: true }],
};

function renderAdvisor(url = "/?business=1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AdvisorPage typingDelayMs={0} />
    </MemoryRouter>,
  );
}

/** Existing business: pick "Change my prices", set month 3, add it to the plan. */
async function makePricePlan() {
  const user = userEvent.setup();
  renderAdvisor();
  await user.click(await screen.findByRole("button", { name: "Change my prices" }));
  const month = await screen.findByLabelText("Starting month");
  await user.clear(month);
  await user.type(month, "3");
  await user.click(screen.getByRole("button", { name: "Add to my plan" }));
  await screen.findByRole("button", { name: "Yes, show me the future" });
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetCoachStore();
  vi.mocked(api.listBusinesses).mockResolvedValue([business]);
  vi.mocked(api.listIndustries).mockResolvedValue([cafe]);
  vi.mocked(api.listScenarios).mockResolvedValue([]);
  vi.mocked(api.createScenario).mockResolvedValue(savedScenario);
  vi.mocked(api.simulateBusiness).mockResolvedValue(run);
  vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: true, mode: null });
  vi.mocked(api.requestCoach).mockResolvedValue(coach);
});

describe("making a decision", () => {
  it("greets you by business and offers decisions in plain words", async () => {
    renderAdvisor();
    expect(await screen.findByText("Welcome back to Demo Cafe! What decision is on your mind?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hire or let go of a barista" })).toBeTruthy();
  });

  it("saves and simulates nothing until you say yes to the plan", async () => {
    await makePricePlan();
    expect(screen.getAllByText("Raise prices 10% from month 3").length).toBeGreaterThan(0);
    expect(api.createScenario).not.toHaveBeenCalled();
    expect(api.simulateBusiness).not.toHaveBeenCalled();
  });

  it("after yes: saves the plan as confirmed, simulates it and shows the result", async () => {
    const user = await makePricePlan();
    await user.click(screen.getByRole("button", { name: "Yes, show me the future" }));

    await waitFor(() => expect(api.simulateBusiness).toHaveBeenCalledWith(1, [5], 24));
    const [, , decisions] = vi.mocked(api.createScenario).mock.calls[0];
    expect(decisions).toEqual([expect.objectContaining({ type: "price", value: 10, start_month: 3, confirmed: true })]);

    expect(await screen.findByText(/about \$18,000 more profit than keeping things as they are/)).toBeTruthy();
    expect(screen.getByText(/Comes out ahead in 8 of 10 futures/)).toBeTruthy();
    expect(await screen.findByText(coach.headline)).toBeTruthy();
  });

  it("reuses a saved plan with the same steps instead of saving a copy", async () => {
    vi.mocked(api.listScenarios).mockResolvedValue([savedScenario]);
    const user = await makePricePlan();
    await user.click(screen.getByRole("button", { name: "Yes, show me the future" }));
    await waitFor(() => expect(api.simulateBusiness).toHaveBeenCalledWith(1, [5], 24));
    expect(api.createScenario).not.toHaveBeenCalled();
  });

  it("points out a problem in the sentence instead of adding it", async () => {
    const user = userEvent.setup();
    renderAdvisor();
    await user.click(await screen.findByRole("button", { name: "Change my prices" }));
    await user.clear(await screen.findByLabelText("Starting month"));
    await user.click(screen.getByRole("button", { name: "Add to my plan" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Pick a month/);
    expect(screen.queryByRole("button", { name: "Yes, show me the future" })).toBeNull();
  });
});

describe("talking about the result", () => {
  async function toResult() {
    const user = await makePricePlan();
    await user.click(screen.getByRole("button", { name: "Yes, show me the future" }));
    await screen.findByRole("button", { name: "Why?" });
    return user;
  }

  it("answers Why? and What could go wrong? from the coach's notes", async () => {
    const user = await toResult();
    await user.click(screen.getByRole("button", { name: "Why?" }));
    expect(await screen.findByText(coach.why)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "What could go wrong?" }));
    expect(await screen.findByText("Keep an eye on your regulars.")).toBeTruthy();
  });

  it("sends a typed question to the coach", async () => {
    vi.mocked(api.askCoach).mockResolvedValue({ answer: "Cash stays safe in all 10 futures.", mode: "template", fallback: false });
    const user = await toResult();
    await user.type(screen.getByLabelText("Your question"), "Will my cash run out?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(api.askCoach).toHaveBeenCalledWith(9, "Will my cash run out?");
    expect(await screen.findByText("Cash stays safe in all 10 futures.")).toBeTruthy();
  });

  it("turns a coach idea into a plan you still have to confirm", async () => {
    vi.mocked(api.listScenarios).mockResolvedValue([savedScenario]);
    const user = await toResult();
    await user.click(screen.getByRole("button", { name: "Any other ideas?" }));
    await user.click(await screen.findByRole("button", { name: "Try this idea" }));

    expect(await screen.findByText("Coach's idea")).toBeTruthy();
    expect(screen.getByText("Hire 1 barista from month 5")).toBeTruthy();
    const createCallsBefore = vi.mocked(api.createScenario).mock.calls.length;
    expect(createCallsBefore).toBe(0);

    await user.click(screen.getByRole("button", { name: "Yes, show me the future" }));
    await waitFor(() => expect(api.createScenario).toHaveBeenCalled());
    const [, , decisions, parentId] = vi.mocked(api.createScenario).mock.calls[0];
    expect(parentId).toBe(5);
    expect(decisions.every((d) => d.confirmed)).toBe(true);
    expect(decisions[1]).toEqual(expect.objectContaining({ type: "hiring", source: "ai" }));
  });

  it("without the coach (the no-coach study group) shows only the numbers", async () => {
    vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: false, mode: null });
    vi.mocked(api.requestCoach).mockRejectedValue(new api.ApiError(404, "the coach is switched off"));
    const user = await makePricePlan();
    await user.click(screen.getByRole("button", { name: "Yes, show me the future" }));
    expect(await screen.findByRole("button", { name: "I'll go with this" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Your question")).toBeNull());
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
    expect(screen.queryByText(coach.headline)).toBeNull();
  });

  it("I'll go with this: shows your decision to keep", async () => {
    const user = await toResult();
    await user.click(screen.getByRole("button", { name: "I'll go with this" }));
    expect(await screen.findByText("Your decision")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Think about another decision" })).toBeTruthy();
  });
});

describe("setting up a new business: example amounts are US dollars", () => {
  async function toFirstNumbers(currency: string) {
    vi.mocked(api.listBusinesses).mockResolvedValue([]);
    vi.mocked(api.previewStartingMonth).mockRejectedValue(new Error("not needed here"));
    const user = userEvent.setup();
    renderAdvisor("/");
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await user.type(await screen.findByLabelText("Business name"), "Corner Café");
    await user.selectOptions(screen.getByLabelText("Currency"), currency);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Next" });
    return user;
  }

  it("shows no notice for USD", async () => {
    await toFirstNumbers("USD");
    expect(screen.queryByText(/These example amounts are in US dollars/)).toBeNull();
  });

  it("highlights money fields in another currency until you change them", async () => {
    const user = await toFirstNumbers("EUR");
    expect(screen.getByText(/please enter your own amounts in EUR/)).toBeTruthy();
    const money = screen.getByLabelText(/Average sale per visit/) as HTMLInputElement;
    expect(money.closest(".field")!.classList.contains("field-highlight")).toBe(true);
    await user.clear(money);
    await user.type(money, "9");
    expect(money.closest(".field")!.classList.contains("field-highlight")).toBe(false);
    expect(screen.queryByText(/please enter your own amounts/)).toBeNull();
  });

  it("checks a typical month with the engine, then saves the business", async () => {
    vi.mocked(api.createBusiness).mockResolvedValue({ ...business, id: 2, name: "Corner Café" });
    const user = await toFirstNumbers("USD");
    vi.mocked(api.previewStartingMonth).mockResolvedValue({
      sales: 50000, ingredient_costs: 1, staff_costs: 1, rent_and_other_costs: 1, marketing: 1, costs: 45000, profit: 5000,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "That's my business" }));
    expect(await screen.findByText(/you make about \$5,000 a month/)).toBeTruthy();
    expect(api.createBusiness).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes, that's about right" }));
    await waitFor(() => expect(api.createBusiness).toHaveBeenCalledWith("Corner Café", "cafe", "USD", expect.any(Object)));
    expect(await screen.findByText("Now, what decision is on your mind?")).toBeTruthy();
  });
});
