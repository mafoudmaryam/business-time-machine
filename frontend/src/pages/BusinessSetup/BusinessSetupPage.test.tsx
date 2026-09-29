import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { BusinessSetupPage } from "./BusinessSetupPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, listIndustries: vi.fn(), previewStartingMonth: vi.fn(), createBusiness: vi.fn() };
});

const cafe: api.IndustryOut = {
  id: "cafe",
  display_name: "Café",
  customer_noun: "regulars",
  staff_noun: "barista",
  capacity_label: "visits per staff member per month",
  default_baseline: {
    customers: 900, cash: 25000, staff_fte: 5, avg_ticket: 6.5, visits_per_regular: 6, walk_in_visits: 2500,
    cogs_ratio: 0.3, wage_per_fte: 3000, fixed_costs: 15000, marketing: 400, churn_rate: 0.05, seats: 35, open_days: 28,
  },
  field_labels: { customers: "Regulars", walk_in_visits: "Walk-in regulars" },
};

async function toFirstNumbersStep() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <BusinessSetupPage />
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole("button", { name: "Café" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  return user;
}

const NOTICE = /These example amounts are in US dollars — please enter your own amounts in EUR/;

describe("setup wizard: example amounts are US dollars", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listIndustries).mockResolvedValue([cafe]);
    vi.mocked(api.previewStartingMonth).mockRejectedValue(new Error("not needed here"));
  });

  it("shows no notice while the currency is USD", async () => {
    await toFirstNumbersStep();
    expect(screen.queryByText(/These example amounts are in US dollars/)).toBeNull();
  });

  it("shows the notice and highlights the money field for another currency, until the owner edits it", async () => {
    const user = await toFirstNumbersStep();
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");

    expect(screen.getByText(NOTICE)).toBeTruthy();
    const money = screen.getByLabelText(/Average sale per visit/) as HTMLInputElement;
    const visits = screen.getByLabelText(/Visits per regular/) as HTMLInputElement;
    expect(money.closest(".field")!.classList.contains("field-highlight")).toBe(true);
    expect(visits.closest(".field")!.classList.contains("field-highlight")).toBe(false); // not money

    await user.clear(money);
    await user.type(money, "9");
    expect(money.closest(".field")!.classList.contains("field-highlight")).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull(); // the only money field on this step is now edited
  });

  it("goes away again when the currency goes back to USD", async () => {
    const user = await toFirstNumbersStep();
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    expect(screen.getByText(NOTICE)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Currency"), "USD");
    expect(screen.queryByText(/These example amounts are in US dollars/)).toBeNull();
  });
});
