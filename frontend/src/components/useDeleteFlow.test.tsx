import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { UndoProvider } from "./UndoProvider";
import { useDeleteFlow, type DeleteTarget } from "./useDeleteFlow";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual, deleteScenario: vi.fn(), restoreScenario: vi.fn(), deleteRun: vi.fn(), restoreRun: vi.fn(), deleteBusiness: vi.fn(),
    restoreBusiness: vi.fn(), getScenarioImpact: vi.fn(), getBusinessImpact: vi.fn(),
  };
});
vi.mock("../lib/events", () => ({ track: vi.fn() }));

const calls = { done: vi.fn(), undone: vi.fn() };

function Harness({ target }: { target: DeleteTarget }) {
  const { ask, dialog } = useDeleteFlow();
  return (
    <>
      <button onClick={() => ask(target)}>Ask</button>
      {dialog}
    </>
  );
}

function mount(target: DeleteTarget) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <UndoProvider>
      <Harness target={target} />
    </UndoProvider>,
  );
  return user;
}

const scenario = (): DeleteTarget => ({ kind: "scenario", id: 5, name: "Raise prices", onDone: calls.done, onUndone: calls.undone });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
  vi.mocked(api.getScenarioImpact).mockResolvedValue({ decisions: 2, runs: 3 });
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 4, runs: 1 });
  vi.mocked(api.deleteScenario).mockResolvedValue({ id: 5, kind: "scenario", name: "Raise prices", deleted_at: "x" });
  vi.mocked(api.restoreScenario).mockResolvedValue({} as api.ScenarioOut);
  vi.mocked(api.deleteRun).mockResolvedValue({ id: 9, kind: "run", name: "x", deleted_at: "x" });
  vi.mocked(api.restoreRun).mockResolvedValue({} as api.SimulationRunSummaryOut);
  vi.mocked(api.deleteBusiness).mockResolvedValue({ id: 2, kind: "business", name: "Corner Cafe", deleted_at: "x" });
  vi.mocked(api.restoreBusiness).mockResolvedValue({} as api.BusinessOut);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the confirmation box", () => {
  it("says in plain words what else goes, for a scenario", async () => {
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const box = await screen.findByRole("dialog", { name: "Delete “Raise prices”?" });
    expect(await within(box).findByText("This also deletes its 2 steps (decisions).")).toBeTruthy();
    expect(within(box).getByText(/3 runs you already made with it stay in your history, with their results/)).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(api.deleteScenario).not.toHaveBeenCalled(); // asking deletes nothing
  });

  it("for a business, names the scenarios and runs that go with it", async () => {
    const user = mount({ kind: "business", id: 2, name: "Corner Cafe" });
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const box = await screen.findByRole("dialog", { name: "Delete “Corner Cafe”?" });
    expect(await within(box).findByText(/all of its 4 scenarios and 1 saved run, with the coach's notes/)).toBeTruthy();
    expect(within(box).getByText("Your other businesses are not affected.")).toBeTruthy();
  });

  it("for a run, says it leaves the history but the scenarios stay", async () => {
    const user = mount({ kind: "run", id: 9, scenarioNames: ["baseline", "Raise prices"] });
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const box = await screen.findByRole("dialog", { name: "Delete run #9?" });
    expect(within(box).getByText(/removes the run \(Raise prices\) from your history/)).toBeTruthy();
    expect(within(box).getByText("The scenarios it used are not deleted.")).toBeTruthy();
  });

  it("still opens, with a general sentence, if the numbers cannot be fetched", async () => {
    vi.mocked(api.getScenarioImpact).mockRejectedValue(new Error("down"));
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const box = await screen.findByRole("dialog");
    expect(within(box).getByText(/This also deletes its steps/)).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("starts with the safe button focused, and Cancel or Esc delete nothing", async () => {
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const box = await screen.findByRole("dialog");
    expect(document.activeElement).toBe(within(box).getByRole("button", { name: "Cancel" }));
    await user.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.deleteScenario).not.toHaveBeenCalled();
    expect(calls.done).not.toHaveBeenCalled();
  });
});

describe("deleting and undoing", () => {
  it("Delete hides it, tells the page, and offers Undo", async () => {
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.deleteScenario).toHaveBeenCalledWith(5);
    expect(calls.done).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Deleted “Raise prices”.");
    expect(within(toast).getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("Undo restores it and tells the page", async () => {
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.restoreScenario).toHaveBeenCalledWith(5);
    expect(calls.undone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("the Undo message goes away after 8 seconds, and nothing else happens", async () => {
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_500);
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(api.restoreScenario).not.toHaveBeenCalled();
  });

  it("works the same for a run and a business", async () => {
    const user = mount({ kind: "run", id: 9, scenarioNames: ["Raise prices"], onUndone: calls.undone });
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.deleteRun).toHaveBeenCalledWith(9);
    expect(screen.getByRole("status").textContent).toContain("Deleted run #9.");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.restoreRun).toHaveBeenCalledWith(9);
  });

  it("business: delete then undo", async () => {
    const user = mount({ kind: "business", id: 2, name: "Corner Cafe" });
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.deleteBusiness).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.restoreBusiness).toHaveBeenCalledWith(2);
  });

  it("if the delete fails, it says so, keeps the box open and tells nobody it worked", async () => {
    vi.mocked(api.deleteScenario).mockRejectedValue(new Error("Could not reach the API."));
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the API");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(calls.done).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("if Undo fails, it says why instead of pretending", async () => {
    vi.mocked(api.restoreScenario).mockRejectedValue(new Error("a scenario called 'Raise prices' exists now"));
    const user = mount(scenario());
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("status").textContent).toContain("exists now");
    expect(calls.undone).not.toHaveBeenCalled();
  });
});
