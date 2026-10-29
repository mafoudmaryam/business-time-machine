import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import * as api from "../../api";
import { getRememberedBusinessId, rememberBusiness } from "../../lib/session";
import type { SalesNeededResult } from "../../lib/salesNeeded";
import { SalesNeededPage } from "./SalesNeededPage";

vi.mock("../../api", async original => ({ ...await original<typeof import("../../api")>(), getBusiness: vi.fn(), calculateSalesNeeded: vi.fn(), simulateBusiness: vi.fn(), createScenario: vi.fn(), requestCoach: vi.fn() }));
const BUSINESS: api.BusinessOut = { id: 7, name: "Repair shop", currency: "EUR", industry: "cafe", baseline: null, is_sample: false, setup_source: "full", created_at: "x" };
const ANSWER: SalesNeededResult = { status: "target", selling_price: "20", cost_per_sale: "8", monthly_costs: "1200", contribution_per_sale: "12", monthly_sales: "100", daily_average: "5", monthly_revenue: "2000", opening_days: 20, cost_share_percent: 40 };
function mount() {
  const tree = <MemoryRouter initialEntries={["/tools"]}><Routes><Route path="/tools" element={<SalesNeededPage />} /><Route path="/explore" element={<p>Explore choices</p>} /><Route path="/" element={<p>Business setup</p>} /></Routes></MemoryRouter>;
  return { user: userEvent.setup(), ...render(tree), tree };
}
async function answer(user: ReturnType<typeof userEvent.setup>, values = ["20", "8", "1200", "20"]) {
  for (let step = 0; step < 4; step++) {
    const input = await screen.findByRole("textbox");
    if (values[step]) await user.type(input, values[step]);
    await user.click(screen.getByRole("button", { name: step === 3 ? "Work out my target" : "Next" }));
  }
}
beforeEach(() => {
  vi.resetAllMocks(); window.sessionStorage.clear(); rememberBusiness(7);
  vi.mocked(api.getBusiness).mockResolvedValue(BUSINESS);
  vi.mocked(api.calculateSalesNeeded).mockResolvedValue(ANSWER);
});

describe("How much do I need to sell?", () => {
  it("uses the chosen currency, asks for every cost and explains scope without running a simulation", async () => {
    const { user } = mount();
    expect(await screen.findByLabelText("Selling price for one sale (EUR)")).toHaveProperty("value", "");
    expect(screen.getByText(/representative sale you choose/)).toBeTruthy();
    expect(screen.getByText(/selling enough to cover these costs/)).toBeTruthy();
    await answer(user);
    const heading = await screen.findByRole("heading", { name: "You need approximately 100 sales per month to cover these costs." });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(/Each sale brings in €20.00/).textContent).toContain("€12.00 remains");
    expect(screen.getByText(/5 sales per opening day/)).toBeTruthy();
    expect(screen.getByText(/not a guarantee of overall profitability/)).toBeTruthy();
    expect(api.calculateSalesNeeded).toHaveBeenCalledWith({ selling_price: "20", cost_per_sale: "8", monthly_costs: "1200", opening_days: "20" }, expect.any(AbortSignal));
    expect(api.simulateBusiness).not.toHaveBeenCalled(); expect(api.createScenario).not.toHaveBeenCalled(); expect(api.requestCoach).not.toHaveBeenCalled();
    expect(getRememberedBusinessId()).toBe(7);
    await user.click(screen.getByRole("link", { name: "Explore an idea in the simulator" }));
    expect(screen.getByText("Explore choices")).toBeTruthy();
  });

  it("never treats missing costs as zero and allows explicitly entered zeros", async () => {
    vi.mocked(api.calculateSalesNeeded).mockResolvedValue({ ...ANSWER, cost_per_sale: "0", monthly_costs: "0", contribution_per_sale: "20", monthly_sales: "0", monthly_revenue: "0", opening_days: null, daily_average: null, cost_share_percent: 0 });
    const { user } = mount();
    await screen.findByRole("textbox"); await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter an amount");
    await user.type(screen.getByRole("textbox"), "20"); await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    await user.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByRole("alert")).toBeTruthy();
    await user.type(screen.getByRole("textbox"), "0"); await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByRole("alert")).toBeTruthy();
    expect(api.calculateSalesNeeded).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox"), "0"); await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Work out my target" }));
    expect(await screen.findByText(/You entered no monthly costs/)).toBeTruthy();
    expect(screen.queryByText(/sales per opening day/)).toBeNull();
    expect(screen.getByText(/Not entered—no daily average/)).toBeTruthy();
  });

  it("explains a non-positive contribution without an infinite or impossible target", async () => {
    vi.mocked(api.calculateSalesNeeded).mockResolvedValue({ ...ANSWER, selling_price: "8", contribution_per_sale: "0", status: "no_margin", monthly_sales: null, monthly_revenue: null, daily_average: null, cost_share_percent: null });
    const { user } = mount(); await answer(user, ["8", "8", "1200", "20"]);
    expect(await screen.findByRole("heading", { name: "Check your price and per-sale costs" })).toBeTruthy();
    expect(screen.getByText(/Each sale leaves nothing/)).toBeTruthy();
    expect(screen.queryByText(/You need approximately/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it("blocks negative amounts and zero opening days with accessible errors", async () => {
    const { user } = mount(); const price = await screen.findByRole("textbox");
    await user.type(price, "-5"); await user.click(screen.getByRole("button", { name: "Next" }));
    expect(price.getAttribute("aria-invalid")).toBe("true"); expect(document.activeElement).toBe(price);
    expect(screen.getByRole("alert").textContent).toContain("non-negative");
    await user.clear(price); await user.type(price, "20"); await user.click(screen.getByRole("button", { name: "Next" }));
    for (const value of ["8", "1200"]) { await user.type(screen.getByRole("textbox"), value); await user.click(screen.getByRole("button", { name: "Next" })); }
    await user.type(screen.getByRole("textbox"), "0"); await user.click(screen.getByRole("button", { name: "Work out my target" }));
    expect(screen.getByRole("alert").textContent).toContain("1 to 31"); expect(api.calculateSalesNeeded).not.toHaveBeenCalled();
  });

  it("preserves editable inputs and hides the previous target during a recalculation", async () => {
    const { user } = mount(); await answer(user); await screen.findByText(/You need approximately 100 sales/);
    await user.click(screen.getByRole("button", { name: "Edit these amounts" }));
    expect(screen.queryByText(/You need approximately/)).toBeNull(); expect(screen.getByRole("textbox")).toHaveProperty("value", "20");
    await user.clear(screen.getByRole("textbox")); await user.type(screen.getByRole("textbox"), "25");
    await user.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByRole("textbox")).toHaveProperty("value", "8");
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: "Next" }));
    let resolve!: (result: SalesNeededResult) => void;
    vi.mocked(api.calculateSalesNeeded).mockReturnValue(new Promise(done => { resolve = done; }));
    await user.click(screen.getByRole("button", { name: "Work out my target" }));
    expect(screen.queryByText(/You need approximately/)).toBeNull();
    expect(screen.getByRole("button", { name: "Working it out…" })).toHaveProperty("disabled", true);
    await act(async () => resolve({ ...ANSWER, selling_price: "25", contribution_per_sale: "17", monthly_sales: "71", monthly_revenue: "1775", daily_average: "3.55", cost_share_percent: 32 }));
    expect(await screen.findByText(/You need approximately 71 sales/)).toBeTruthy();
    expect(screen.queryByText(/100 sales per month/)).toBeNull();
  });

  it("keeps amounts after a failed request and allows a retry", async () => {
    vi.mocked(api.calculateSalesNeeded).mockRejectedValueOnce(new Error("offline"));
    const { user } = mount(); await answer(user);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("amounts are still here"));
    expect(screen.queryByText(/You need approximately/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Work out my target" }));
    expect(await screen.findByText(/You need approximately 100 sales/)).toBeTruthy();
  });

  it("requires an explicit guest currency and resets amounts rather than silently converting them", async () => {
    window.sessionStorage.clear(); const { user } = mount();
    expect(screen.getByLabelText("Choose your currency")).toHaveProperty("value", ""); expect(screen.queryByRole("textbox")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Choose your currency"), "JPY");
    expect(await screen.findByLabelText("Selling price for one sale (JPY)")).toBeTruthy();
    await answer(user); expect(await screen.findByText(/Each sale brings in ¥20\./)).toBeTruthy();
    expect(api.getBusiness).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Set up a business to explore an idea" }).getAttribute("href")).toBe("/");
    await user.selectOptions(screen.getByLabelText("Choose your currency"), "EUR");
    expect(screen.queryByText(/You need approximately/)).toBeNull();
    expect(screen.getByLabelText("Selling price for one sale (EUR)")).toHaveProperty("value", "");
  });

  it("does not substitute a default currency if the selected business cannot load", async () => {
    vi.mocked(api.getBusiness).mockRejectedValue(new Error("offline")); mount();
    expect(await screen.findByText(/We need your selected business currency/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull(); expect(api.calculateSalesNeeded).not.toHaveBeenCalled();
  });

  it("aborts an old calculation when the selected business changes", async () => {
    const view = mount();
    vi.mocked(api.calculateSalesNeeded).mockReturnValue(new Promise(() => undefined)); await answer(view.user);
    const signal = vi.mocked(api.calculateSalesNeeded).mock.calls[0][1]!;
    rememberBusiness(8); vi.mocked(api.getBusiness).mockResolvedValue({ ...BUSINESS, id: 8, currency: "GBP" });
    view.rerender(<MemoryRouter><SalesNeededPage /></MemoryRouter>);
    expect(signal.aborted).toBe(true);
    expect(await screen.findByLabelText("Selling price for one sale (GBP)")).toHaveProperty("value", "");
    expect(screen.queryByText(/You need approximately/)).toBeNull();
  });

  it("has no automatic accessibility violations through all questions and the result", async () => {
    const { user, container } = mount();
    for (const value of ["20", "8", "1200", "20"]) {
      const input = await screen.findByRole("textbox"); expect((await axe(container)).violations).toEqual([]);
      await user.type(input, value); await user.click(screen.getByRole("button", { name: value === "20" && screen.queryByRole("button", { name: "Work out my target" }) ? "Work out my target" : "Next" }));
    }
    await screen.findByText(/You need approximately 100 sales/); expect((await axe(container)).violations).toEqual([]);
  });
});
