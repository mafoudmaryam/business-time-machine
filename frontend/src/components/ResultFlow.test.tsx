import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import * as api from "../api";
import { makeRun } from "../test-fixtures";
import { ComparisonDashboardPage } from "../pages/Comparison/ComparisonDashboardPage";
import { RunHistoryPage } from "../pages/RunHistory/RunHistoryPage";
import { UndoProvider } from "./UndoProvider";
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), listBusinesses: vi.fn(), listIndustries: vi.fn(), listScenarios: vi.fn(), simulateBusiness: vi.fn(), listSimulationRuns: vi.fn(), getSimulationRun: vi.fn() }));
vi.mock("./CoachCard", () => ({ CoachCard: () => <p>Optional coach</p> }));
vi.mock("../pages/Comparison/MetricChart", () => ({ MetricChart: () => <p>Detailed chart</p> }));
const NAME = "Raise prices by 13% from November 2026";
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listBusinesses).mockResolvedValue([{ id: 1, name: "Shop", industry: "cafe", currency: "USD", created_at: "x", is_sample: false, setup_source: "full", baseline: null }]);
  vi.mocked(api.listIndustries).mockResolvedValue([]);
  vi.mocked(api.listScenarios).mockResolvedValue([{ id: 4, business_id: 1, name: NAME, created_at: "x", parent_scenario_id: null, parent_scenario_name: null, decisions: [{ id: 1, type: "price", value: 13, unit: "percent", start_month: 1, extra: {}, source: "user", confirmed: true }] }]);
  vi.mocked(api.simulateBusiness).mockResolvedValue(makeRun());
  vi.mocked(api.listSimulationRuns).mockResolvedValue([2, 3].map(id => ({ id, business_id: 1, horizon: 12, iterations: 1000, seed: 7, created_at: "x", engine_version: "1", scenario_names: ["baseline", NAME] })));
});
function mount(page: "compare" | "runs") { render(<MemoryRouter initialEntries={[`/${page}?business=1`]}><UndoProvider>{page === "compare" ? <ComparisonDashboardPage /> : <RunHistoryPage />}</UndoProvider></MemoryRouter>); return userEvent.setup(); }
describe("matching saved-result explanations", () => {
  it("hides a comparison as soon as its horizon changes and while the next run loads", async () => {
    const user = mount("compare");
    await user.click(await screen.findByRole("checkbox", { name: new RegExp(NAME) }));
    await user.click(screen.getByRole("button", { name: "Compare plans" }));
    expect(await screen.findByRole("region", { name: `Understand “${NAME}”` })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Months to simulate"), "36");
    expect(screen.queryByRole("region", { name: `Understand “${NAME}”` })).toBeNull();
    const next = deferred<api.SimulationRunOut>(); vi.mocked(api.simulateBusiness).mockReturnValue(next.promise);
    await user.click(screen.getByRole("button", { name: "Compare plans" }));
    expect(screen.queryByText(/Comparing the middle simulated totals/)).toBeNull();
    await act(async () => next.resolve(makeRun({ horizon: 36, id: 3 })));
    expect(screen.getByRole("region", { name: `Understand “${NAME}”` }).textContent).toContain("36 months in total");
  });
  it("clears the previous history explanation during loading and ignores late older requests", async () => {
    const user = mount("runs");
    vi.mocked(api.getSimulationRun).mockResolvedValueOnce(makeRun());
    await user.click((await screen.findAllByRole("button", { name: "Reopen" }))[0]);
    expect(await screen.findByRole("region", { name: `Understand “${NAME}”` })).toBeTruthy();
    const older = deferred<api.SimulationRunOut>(); const latest = deferred<api.SimulationRunOut>();
    vi.mocked(api.getSimulationRun).mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]).getByRole("button", { name: "Reopen" }));
    expect(screen.queryByRole("region", { name: `Understand “${NAME}”` })).toBeNull();
    await user.click(within(rows[2]).getByRole("button", { name: "Reopen" }));
    await act(async () => latest.resolve(makeRun({ id: 3, horizon: 36 })));
    expect(screen.getByRole("region", { name: `Understand “${NAME}”` }).textContent).toContain("36 months in total");
    await act(async () => older.resolve(makeRun({ id: 2 })));
    expect(screen.getByRole("region", { name: `Understand “${NAME}”` }).textContent).toContain("36 months in total");
  });
});
