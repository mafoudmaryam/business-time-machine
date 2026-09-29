import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { CoachCard } from "./CoachCard";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, getCoachStatus: vi.fn(), requestCoach: vi.fn(), askCoach: vi.fn(), getScenario: vi.fn() };
});

const coach: api.CoachOut = {
  mode: "ollama",
  model: "qwen2.5:7b",
  fallback: false,
  headline: "Raising prices looks like a good move.",
  what_happens: "You could make about 4,200 USD more.",
  why: "Each sale brings in more.",
  watch_out: ["Keep an eye on your regulars."],
  generated_at: "2026-09-29T00:00:00Z",
  ideas: [
    {
      title: "Add one more barista",
      why: "Busy months.",
      builds_on: "Raise prices",
      builds_on_scenario_id: 4,
      decisions: [{ type: "hiring", start_month: 5, value: 1, unit: "fte" }],
      decision_texts: ["Hire 1 full-time staff from month 5"],
      result: {
        profit_change_most_likely: 1500,
        beats_change_nothing_of_10: 7,
        cash_runs_out_of_10: 2,
        profit_bad_case: 1,
        profit_most_likely: 2,
        profit_good_case: 3,
      },
    },
  ],
};

const parent: api.ScenarioOut = {
  id: 4,
  business_id: 1,
  name: "Raise prices",
  parent_scenario_id: null,
  parent_scenario_name: null,
  created_at: "2026-01-01",
  decisions: [
    { id: 1, type: "price", start_month: 3, value: 10, unit: "percent", extra: {}, source: "user", confirmed: true },
  ],
};

function StateProbe() {
  const location = useLocation();
  const prefill = (location.state as { prefill?: { name: string; decisions: { confirmed: boolean }[] } } | null)
    ?.prefill;
  if (!prefill) return <div>builder</div>;
  const anyConfirmed = prefill.decisions.some((d) => d.confirmed);
  return <div>{`builder: ${prefill.name} (${prefill.decisions.length} decisions, confirmed: ${anyConfirmed})`}</div>;
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/compare"]}>
      <Routes>
        <Route path="/compare" element={<CoachCard runId={9} businessId={1} currency="USD" />} />
        <Route path="/scenarios" element={<StateProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CoachCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: true, mode: null });
    vi.mocked(api.requestCoach).mockResolvedValue(coach);
  });

  it("starts right away, shows the loading text, then the story, watch-out, idea and footer", async () => {
    renderCard();
    expect(screen.getByText("Your coach is reading the results…")).toBeTruthy();
    expect(api.requestCoach).toHaveBeenCalledWith(9);

    expect(await screen.findByText("Raising prices looks like a good move.")).toBeTruthy();
    expect(screen.getByText("Keep an eye on your regulars.")).toBeTruthy();
    expect(screen.getByText("Add one more barista")).toBeTruthy();
    expect(screen.getByText("Hire 1 full-time staff from month 5")).toBeTruthy();
    expect(screen.getByText(/in 7 of 10 futures/)).toBeTruthy();
    expect(screen.getByText(/in 2 of 10 futures/)).toBeTruthy();
    expect(screen.getByText(/\+\$1,500/)).toBeTruthy();
    expect(screen.getByText(/not financial advice/)).toBeTruthy();
  });

  it("hides which coach is active unless the server allows it", async () => {
    renderCard();
    await screen.findByText(coach.headline);
    expect(screen.queryByText(/Local AI coach/)).toBeNull();
  });

  it("shows the mode label when the server allows it", async () => {
    vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: true, mode: "ollama" });
    renderCard();
    expect(await screen.findByText(/Local AI coach/)).toBeTruthy();
  });

  it("renders nothing when the coach is switched off", async () => {
    vi.mocked(api.requestCoach).mockRejectedValue(new api.ApiError(404, "the coach is switched off"));
    const { container } = renderCard();
    await waitFor(() => expect(api.requestCoach).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector(".coach-card")).toBeNull());
  });

  it("shows a friendly error with a retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(api.requestCoach).mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error"));
    renderCard();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't put the notes together/);
    expect(alert.textContent).not.toMatch(/500|Internal/);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(coach.headline)).toBeTruthy();
  });

  it("Try this idea opens the scenario builder with unconfirmed decisions", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getScenario).mockResolvedValue(parent);
    renderCard();
    await user.click(await screen.findByRole("button", { name: "Try this idea" }));
    expect(api.getScenario).toHaveBeenCalledWith(4);
    expect(
      await screen.findByText("builder: Raise prices + Add one more barista (2 decisions, confirmed: false)"),
    ).toBeTruthy();
  });

  it("answers a typed question", async () => {
    const user = userEvent.setup();
    vi.mocked(api.askCoach).mockResolvedValue({
      answer: "Cash runs out in 2 of 10 futures.",
      mode: "template",
      fallback: false,
    });
    renderCard();
    await screen.findByText(coach.headline);
    await user.type(screen.getByLabelText("Your question"), "Will my cash run out?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(api.askCoach).toHaveBeenCalledWith(9, "Will my cash run out?");
    expect(await screen.findByText("Cash runs out in 2 of 10 futures.")).toBeTruthy();
  });

  it("shows a friendly message when a question fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.askCoach).mockRejectedValue(new api.ApiError(500, "boom"));
    renderCard();
    await screen.findByText(coach.headline);
    await user.click(screen.getByRole("button", { name: "Will my cash run out?" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/boom/);
  });
});
