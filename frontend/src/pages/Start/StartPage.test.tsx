import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { getRememberedBusinessId } from "../../lib/session";
import { StartPage } from "./StartPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, listIndustries: vi.fn(), listBusinesses: vi.fn(), quickBaseline: vi.fn(), createQuickBusiness: vi.fn(),
    createSampleBusiness: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

function industry(id: string, name: string): api.IndustryOut {
  return {
    id, display_name: name, customer_noun: "regulars", staff_noun: "barista", capacity_label: "x",
    default_baseline: {
      customers: 900, cash: 25000, staff_fte: 5, avg_ticket: 6.5, visits_per_regular: 6, walk_in_visits: 2500, cogs_ratio: 0.3,
      wage_per_fte: 3000, fixed_costs: 15000, marketing: 400, churn_rate: 0.05, seats: 35, open_days: 28,
    },
    field_labels: {},
  };
}

const QUICK: api.QuickStartOut = {
  baseline: {
    customers: 600, cash: 51400, staff_fte: 4, avg_ticket: 7.5, visits_per_regular: 6, walk_in_visits: 3000, cogs_ratio: 0.3,
    wage_per_fte: 3000, fixed_costs: 4000, marketing: 245, churn_rate: 0.05, seats: 35, open_days: 28,
  },
  assumed: [
    { field: "fixed_costs", rule: "your rent plus a rough rule: one third of the rent again" },
    { field: "cash", rule: "two months of your monthly costs" },
    { field: "staff_fte", rule: "counted as full-time people" },
    { field: "marketing", rule: "the share of sales a small café typically spends" },
  ],
  warnings: [],
  preview: { sales: 31500, ingredient_costs: 9450, staff_costs: 12000, rent_and_other_costs: 4000, marketing: 245, costs: 25700, profit: 5820 },
};

const BUSINESS = (over: Partial<api.BusinessOut> = {}): api.BusinessOut => ({
  id: 12, name: "My café", industry: "cafe", currency: "USD", created_at: "2026-10-03", setup_source: "quick", is_sample: false,
  baseline: null, ...over,
});

function mount() {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={<StartPage />} />
        <Route path="/today" element={<p>Today page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

async function fillAnswers(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Customers on a normal day/), "150");
  await user.type(screen.getByLabelText(/Average spend per customer/), "7.5");
  await user.type(screen.getByLabelText(/Monthly rent/), "3000");
  await user.type(screen.getByLabelText(/People who work there/), "4");
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(api.listIndustries).mockResolvedValue([industry("cafe", "Café"), industry("restaurant", "Restaurant"), industry("bakery", "Bakery")]);
  vi.mocked(api.listBusinesses).mockResolvedValue([]);
  vi.mocked(api.quickBaseline).mockResolvedValue(QUICK);
  vi.mocked(api.createQuickBusiness).mockResolvedValue(BUSINESS());
  vi.mocked(api.createSampleBusiness).mockResolvedValue(BUSINESS({ id: 99, name: "Sample café", is_sample: true, setup_source: "sample" }));
});

describe("start screen: business type", () => {
  it("shows the three business types, each with a one-click sample", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Café" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restaurant" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bakery" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try a sample café" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try a sample bakery" })).toBeTruthy();
  });

  it("asks for a type before going on", async () => {
    const { user } = mount();
    await screen.findByRole("button", { name: "Café" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a business type");
    expect(screen.getByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = mount();
    await screen.findByRole("button", { name: "Café" });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("start screen: sample business", () => {
  it("one click makes a sample, remembers it and opens Today", async () => {
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Try a sample café" }));
    expect(api.createSampleBusiness).toHaveBeenCalledWith("cafe", "USD");
    expect(await screen.findByText("Today page")).toBeTruthy();
    expect(getRememberedBusinessId()).toBe(99);
  });

  it("uses the chosen currency", async () => {
    const { user } = mount();
    await user.click(screen.getByRole("button", { name: "Change currency" }));
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await user.click(await screen.findByRole("button", { name: "Try a sample bakery" }));
    expect(api.createSampleBusiness).toHaveBeenCalledWith("bakery", "EUR");
  });

  it("shows a friendly error and stays put when it fails", async () => {
    vi.mocked(api.createSampleBusiness).mockRejectedValue(new Error("Could not reach the API."));
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Try a sample café" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the API");
    expect(screen.queryByText("Today page")).toBeNull();
  });
});

describe("start screen: the four questions", () => {
  async function toQuestions() {
    const ctx = mount();
    await ctx.user.click(await screen.findByRole("button", { name: "Café" }));
    await ctx.user.click(screen.getByRole("button", { name: "Next" }));
    return ctx;
  }

  it("asks exactly four things, empty to begin with (no forced 0)", async () => {
    await toQuestions();
    for (const label of [/Customers on a normal day/, /Average spend per customer/, /Monthly rent/, /People who work there/]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
    }
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  it("says staff are counted as full-time people", async () => {
    await toQuestions();
    expect(screen.getAllByText(/Two part-timers count as one/).length).toBeGreaterThan(0);
  });

  it("checks the answers on Next, not while typing", async () => {
    const { user } = await toQuestions();
    await user.type(screen.getByLabelText(/Customers on a normal day/), "1");
    expect(screen.queryByText("Enter a number.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText(/Enter a number/).length).toBeGreaterThanOrEqual(2);
    expect(api.quickBaseline).not.toHaveBeenCalled();
  });

  it("sends the four answers, then shows the engine's month and what was assumed", async () => {
    const { user } = await toQuestions();
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(api.quickBaseline).toHaveBeenCalledWith("cafe", { customers_per_day: 150, avg_spend: 7.5, monthly_rent: 3000, staff: 4 });
    expect(await screen.findByText(/About \$31,500 in sales and \$25,700 in costs, so you make about \$5,820 a month/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What we assumed" })).toBeTruthy();
    expect(screen.getByText(/\$51,400: two months of your monthly costs/)).toBeTruthy();
    expect(screen.getByText(/\$4,000 a month: your rent plus a rough rule/)).toBeTruthy();
    expect(screen.getByText(/4 people: counted as full-time people/)).toBeTruthy();
    expect((screen.getByLabelText("What is it called?") as HTMLInputElement).value).toBe("My café");
  });

  it("shows the engine's warnings", async () => {
    vi.mocked(api.quickBaseline).mockResolvedValue({ ...QUICK, warnings: ["Two people can look after about 100 customers a day."] });
    const { user } = await toQuestions();
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("note")).textContent).toContain("Two people can look after");
  });

  it("creates the business, remembers it and opens Today", async () => {
    const { user } = await toQuestions();
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.clear(await screen.findByLabelText("What is it called?"));
    await user.type(screen.getByLabelText("What is it called?"), "Corner Café");
    await user.click(screen.getByRole("button", { name: "Looks right, show me" }));
    expect(api.createQuickBusiness).toHaveBeenCalledWith("Corner Café", "cafe", "USD", QUICK);
    expect(await screen.findByText("Today page")).toBeTruthy();
    expect(getRememberedBusinessId()).toBe(12);
  });

  it("in another currency, says the typical amounts are US dollars", async () => {
    const { user } = mount();
    await user.click(screen.getByRole("button", { name: "Change currency" }));
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/typical amounts are US dollars, so please check them in EUR/)).toBeTruthy();
    expect(screen.getByText(/€51,400/)).toBeTruthy();
  });

  it("shows an error and stays on the question page if the engine refuses", async () => {
    vi.mocked(api.quickBaseline).mockRejectedValue(new Error("staff is too small"));
    const { user } = await toQuestions();
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toContain("staff is too small");
    expect(screen.getByLabelText(/Monthly rent/)).toBeTruthy();
  });

  it("Back returns to the previous step and keeps the answers", async () => {
    const { user } = await toQuestions();
    await fillAnswers(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect((screen.getByLabelText(/Monthly rent/) as HTMLInputElement).value).toBe("3000");
  });

  it("has no accessibility violations on the questions", async () => {
    const { container } = await toQuestions();
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("start screen: coming back", () => {
  it("offers to continue with a business that already exists", async () => {
    vi.mocked(api.listBusinesses).mockResolvedValue([BUSINESS({ id: 3, name: "Noah's" })]);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Continue with Noah's" }));
    expect(await screen.findByText("Today page")).toBeTruthy();
    expect(getRememberedBusinessId()).toBe(3);
  });
});
