import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { UndoProvider } from "../../components/UndoProvider";
import { RunHistoryPage } from "./RunHistoryPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, listBusinesses: vi.fn(), listIndustries: vi.fn(), listSimulationRuns: vi.fn(), deleteRun: vi.fn(), restoreRun: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

const run = (id: number, names: string[]): api.SimulationRunSummaryOut => ({
  id, business_id: 1, engine_version: "1", seed: 7, iterations: 1000, horizon: 24, created_at: "2026-10-01T10:00:00", scenario_names: names,
});

function mount() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/history?business=1"]}>
      <UndoProvider>
        <RunHistoryPage />
      </UndoProvider>
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listBusinesses).mockResolvedValue([
    { id: 1, name: "Cafe", industry: "cafe", currency: "USD", created_at: "x", setup_source: "full", is_sample: false, baseline: null },
  ]);
  vi.mocked(api.listIndustries).mockResolvedValue([]);
  vi.mocked(api.listSimulationRuns).mockResolvedValue([run(11, ["baseline", "Raise prices"]), run(12, ["baseline", "Hire"])]);
  vi.mocked(api.deleteRun).mockResolvedValue({ id: 11, kind: "run", name: "Raise prices", deleted_at: "x" });
  vi.mocked(api.restoreRun).mockResolvedValue(run(11, ["baseline", "Raise prices"]));
});

describe("run history: delete", () => {
  it("each run has a Delete button, and asking deletes nothing", async () => {
    const user = mount();
    await user.click(await screen.findByRole("button", { name: "Delete run #11" }));
    const box = await screen.findByRole("dialog", { name: "Delete run #11?" });
    expect(within(box).getByText(/from your history, with its charts and the coach's notes/)).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(api.deleteRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete run #12" })).toBeTruthy();
  });

  it("confirming deletes it, refreshes the list and offers Undo", async () => {
    const user = mount();
    await user.click(await screen.findByRole("button", { name: "Delete run #11" }));
    vi.mocked(api.listSimulationRuns).mockResolvedValue([run(12, ["baseline", "Hire"])]);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.deleteRun).toHaveBeenCalledWith(11);
    expect(screen.queryByRole("button", { name: "Delete run #11" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete run #12" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Deleted run #11.");
  });

  it("Undo puts the run back in the list", async () => {
    const user = mount();
    await user.click(await screen.findByRole("button", { name: "Delete run #11" }));
    vi.mocked(api.listSimulationRuns).mockResolvedValue([run(12, ["baseline", "Hire"])]);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    vi.mocked(api.listSimulationRuns).mockResolvedValue([run(11, ["baseline", "Raise prices"]), run(12, ["baseline", "Hire"])]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.restoreRun).toHaveBeenCalledWith(11);
    expect(await screen.findByRole("button", { name: "Delete run #11" })).toBeTruthy();
  });

  it("Cancel keeps the run", async () => {
    const user = mount();
    await user.click(await screen.findByRole("button", { name: "Delete run #11" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.deleteRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete run #11" })).toBeTruthy();
  });
});
