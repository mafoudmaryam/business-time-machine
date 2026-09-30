import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { ScenarioBuilderPage } from "./ScenarioBuilderPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    listBusinesses: vi.fn(),
    listIndustries: vi.fn(),
    listScenarios: vi.fn(),
    interpretText: vi.fn(),
    createScenario: vi.fn(),
    logInterpretOutcome: vi.fn(),
  };
});

const baseline = {
  customers: 900, cash: 25000, staff_fte: 5, avg_ticket: 6.5, visits_per_regular: 6, walk_in_visits: 2500, cogs_ratio: 0.3,
  wage_per_fte: 3000, fixed_costs: 15000, marketing: 400, churn_rate: 0.05, seats: 35, open_days: 28,
};

const reading: api.Interpretation = {
  id: 7, business_id: 1, text: "Raise prices 10% in March and hire a baker for the summer", status: "done", provider: null,
  fallback: null, questions: [], out_of_scope: null, notes: [], month_one: "",
  decisions: [
    {
      type: "price", start_month: 6, value: 10, unit: "percent", source_quote: "Raise prices 10% in March",
      sentence: "Raise prices 10%, from March 2027 (month 6)", when_label: "March 2027 (month 6)", group: null, role: null, group_sentence: null,
    },
    {
      type: "hiring", start_month: 9, value: 1, unit: "fte", source_quote: "hire a baker for the summer",
      sentence: "Hire 1 baker, June → August 2027 (months 9–11)", when_label: "June → August 2027 (months 9–11)", group: "g1", role: "start",
      group_sentence: "Hire 1 baker, June → August 2027 (months 9–11)",
    },
    {
      type: "hiring", start_month: 12, value: -1, unit: "fte", source_quote: "hire a baker for the summer",
      sentence: "Back to normal from September 2027 (month 12)", when_label: "June → August 2027 (months 9–11)", group: "g1", role: "end",
      group_sentence: "Hire 1 baker, June → August 2027 (months 9–11)",
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/scenarios?business=1"]}>
      <ScenarioBuilderPage />
    </MemoryRouter>,
  );
}

async function describeIt(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("What would you like to change?"), reading.text);
  await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
  await screen.findByText(/I found 2 steps/);
}

describe("ScenarioBuilderPage: describe it in your own words", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listBusinesses).mockResolvedValue([
      { id: 1, name: "Sunrise Bakery", industry: "bakery", currency: "USD", created_at: "2026-01-01", baseline: { id: 1, created_at: "2026-01-01", ...baseline } },
    ]);
    vi.mocked(api.listIndustries).mockResolvedValue([
      { id: "bakery", display_name: "Bakery", customer_noun: "regulars", staff_noun: "baker", capacity_label: "ovens", default_baseline: baseline, field_labels: {} },
    ]);
    vi.mocked(api.listScenarios).mockResolvedValue([]);
    vi.mocked(api.interpretText).mockResolvedValue(reading);
    vi.mocked(api.logInterpretOutcome).mockResolvedValue(undefined);
  });

  it("turns the owner's words into UNTICKED steps, and names the scenario after them", async () => {
    const user = userEvent.setup();
    renderPage();
    await describeIt(user);

    expect(screen.getByText("Raise prices 10%, from March 2027 (month 6)")).toBeTruthy();
    expect(screen.getByText("Hire 1 baker, June → August 2027 (months 9–11)")).toBeTruthy();
    expect(screen.getByText("From your words: “hire a baker for the summer”")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => !b.checked)).toBe(true); // nothing is ticked for the owner
    expect((screen.getByLabelText("Scenario name") as HTMLInputElement).value).toBe(reading.text);
  });

  it("saves only what the owner ticked, and tells the server what they finally kept", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createScenario).mockResolvedValue({
      id: 21, business_id: 1, name: reading.text, parent_scenario_id: null, parent_scenario_name: null, created_at: "x", decisions: [],
    });
    renderPage();
    await describeIt(user);

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(screen.getByRole("button", { name: "Save scenario" }));

    await waitFor(() => expect(api.createScenario).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.createScenario).mock.calls[0][2];
    expect(saved).toHaveLength(3); // the temporary hire is still two decisions for the engine
    expect(saved.every((d) => d.confirmed && d.source === "ai")).toBe(true);
    expect(saved.map((d) => [d.type, d.start_month, d.value])).toEqual([
      ["price", 6, 10], ["hiring", 9, 1], ["hiring", 12, -1],
    ]);
    await waitFor(() => expect(api.logInterpretOutcome).toHaveBeenCalledWith(7, saved, 21));
  });

  it("a failed outcome log never stops the scenario from saving", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createScenario).mockResolvedValue({
      id: 21, business_id: 1, name: "n", parent_scenario_id: null, parent_scenario_name: null, created_at: "x", decisions: [],
    });
    vi.mocked(api.logInterpretOutcome).mockRejectedValue(new Error("offline"));
    renderPage();
    await describeIt(user);
    await user.click(screen.getByRole("button", { name: "Save scenario" }));
    expect(await screen.findByText(/Saved "/)).toBeTruthy();
  });

  it("editing a step un-ticks it, and reading again replaces the earlier steps but keeps hand-added ones", async () => {
    const user = userEvent.setup();
    renderPage();
    await describeIt(user);

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const amount = screen.getByLabelText(/Price change/);
    await user.clear(amount);
    await user.type(amount, "8");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Raise prices 8% from month 6")).toBeTruthy();
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(false); // editing un-ticks

    // add one by hand, then read again: only the AI's steps are replaced
    const form = screen.getByText("Add decision").closest(".decision-form") as HTMLElement;
    await user.click(within(form).getByRole("button", { name: "Add decision" }));
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);

    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    await waitFor(() => expect(api.interpretText).toHaveBeenCalledTimes(2));
    await screen.findByText("Raise prices 10%, from March 2027 (month 6)");
    expect(screen.queryByText("Raise prices 8% from month 6")).toBeNull();
    expect(screen.getByText("Raise prices 10% from month 1")).toBeTruthy(); // the hand-added step is still there
  });
});
