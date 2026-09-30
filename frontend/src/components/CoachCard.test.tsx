import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { CoachCard } from "./CoachCard";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, getCoachStatus: vi.fn(), requestCoach: vi.fn(), getCoach: vi.fn(), askCoach: vi.fn(), getScenario: vi.fn() };
});

const coach: api.CoachOut = {
  mode: "ollama",
  model: "qwen2.5:7b",
  fallback: false,
  headline: "Raising prices looks like a good move.",
  what_happens: "You could make about 4,200 USD more.",
  why: "Each sale brings in more.",
  watch_out: ["Keep an eye on your regulars."],
  summary: {
    tiles: [
      { key: "profit", now: 2100, later: 3900 },
      { key: "cash", now: 25000, later: 24000 },
      { key: "customers", now: 900, later: 900 },
    ],
    customers_word: "regulars",
    scenario: "Raise prices",
    verdict: { key: "good", label: "Good idea" },
    months: 24,
    profit_change: 26900,
    better_of_10: 8,
    regulars_change_count: 0,
    regulars_change_percent: 0,
    bars: [
      { key: "price", label: "Higher prices", amount: 31000 },
      { key: "visits", label: "Fewer visits", amount: -4100 },
    ],
    risk_flags: ["regulars"],
    has_risk: true,
  },
  generated_at: "2026-09-29T00:00:00Z",
  ai_status: "none",
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

  it("starts right away, shows the loading text, then the badge, tiles, bars, watch-out, idea and footer", async () => {
    renderCard();
    expect(screen.getByText("Your coach is reading the results…")).toBeTruthy();
    expect(api.requestCoach).toHaveBeenCalledWith(9);

    expect(await screen.findByText("Raising prices looks like a good move.")).toBeTruthy();
    expect(screen.getByText("Good idea")).toBeTruthy(); // the verdict badge
    expect(screen.getByText(/Keep an eye on your regulars\./)).toBeTruthy();
    expect(screen.getByText("Add one more barista")).toBeTruthy();
    expect(screen.getByText("Hire 1 full-time staff from month 5")).toBeTruthy();
    expect(screen.getByText(/ahead in 7 of 10 futures/)).toBeTruthy();
    expect(screen.getByText(/cash runs out in 2 of 10/)).toBeTruthy();
    expect(screen.getByText(/\+\$1,500/)).toBeTruthy();
    expect(screen.getByText(/not financial advice/)).toBeTruthy();
  });

  it("shows three now-to-later tiles, each with a text label and not only a colour", async () => {
    renderCard();
    await screen.findByText(coach.headline);
    const tiles = screen.getByRole("list", { name: "How things change" });
    const items = within(tiles).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toMatch(/Profit a month/);
    expect(items[0].textContent).toMatch(/\$2,100/);
    expect(items[0].textContent).toMatch(/\$3,900/);
    expect(items[0].textContent).toMatch(/Better/);
    expect(items[0].className).toMatch(/trend-up/);
    expect(items[1].textContent).toMatch(/Cash in the bank/);
    expect(items[1].textContent).toMatch(/Lower/);
    expect(items[1].className).toMatch(/trend-down/);
    expect(items[2].textContent).toMatch(/Regulars/);
    expect(items[2].textContent).toMatch(/About the same/);
    // a plain sentence for screen readers
    expect(within(items[0]).getByText(/Now \$2,100, in 2 years \$3,900\. Better\./)).toBeTruthy();
  });

  it("shows the bars it is given, with amounts and a helps/hurts word", async () => {
    renderCard();
    await screen.findByText(coach.headline);
    expect(screen.getByText("Higher prices")).toBeTruthy();
    expect(screen.getByText("Fewer visits")).toBeTruthy();
    expect(screen.getByText(/\+\$31,000/)).toBeTruthy();
    expect(screen.getByText(/−\$4,100/)).toBeTruthy();
    expect(screen.getByText("helps")).toBeTruthy();
    expect(screen.getByText("hurts")).toBeTruthy();
  });

  it("shows no Watch out line when there is no real risk", async () => {
    vi.mocked(api.requestCoach).mockResolvedValue({
      ...coach,
      watch_out: [],
      summary: { ...coach.summary, risk_flags: [], has_risk: false },
    });
    renderCard();
    await screen.findByText(coach.headline);
    expect(screen.queryByText(/Watch out/)).toBeNull();
  });

  it("keeps the full story behind a Read the full story toggle", async () => {
    const user = userEvent.setup();
    const { container } = renderCard();
    await screen.findByText(coach.headline);
    const details = container.querySelector("details.coach-story") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText("Read the full story"));
    expect(details.open).toBe(true);
    expect(screen.getByText("You could make about 4,200 USD more.")).toBeTruthy();
    expect(screen.getByText("Each sale brings in more.")).toBeTruthy();
  });

  it("uses no emoji anywhere on the card", async () => {
    const { container } = renderCard();
    await screen.findByText(coach.headline);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
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

  it("Try it opens the scenario builder with unconfirmed decisions", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getScenario).mockResolvedValue(parent);
    renderCard();
    await user.click(await screen.findByRole("button", { name: "Try it: Add one more barista" }));
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

describe("CoachCard while the AI is still writing", () => {
  const aiVersion: api.CoachOut = {
    ...coach,
    mode: "ollama",
    headline: "The detailed AI headline.",
    ai_status: "done",
  };
  const ruleBased: api.CoachOut = { ...coach, mode: "template", ai_status: "pending" };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: true, mode: null });
    vi.mocked(api.requestCoach).mockResolvedValue(ruleBased);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the rule-based coach at once with a calm line (no timer), then swaps in the AI version with a tag", async () => {
    vi.mocked(api.getCoach).mockResolvedValueOnce(ruleBased).mockResolvedValue(aiVersion);
    const { container } = renderCard();

    expect(await screen.findByText(coach.headline)).toBeTruthy(); // rule-based text is already readable
    expect(screen.getByText("Your coach is adding more detail…")).toBeTruthy();
    expect(container.querySelector(".coach-dot")).not.toBeNull();
    expect(screen.queryByText(/\d:\d\d/)).toBeNull(); // no counting seconds
    expect(screen.queryByText("Updated with more detail")).toBeNull();

    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText(coach.headline)).toBeTruthy(); // still pending after the first poll
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText("The detailed AI headline.")).toBeTruthy();
    expect(screen.queryByText("Your coach is adding more detail…")).toBeNull();
    expect(screen.getByText("Updated with more detail")).toBeTruthy();
    expect(container.querySelector(".coach-fade")).not.toBeNull(); // the swap fades in
    expect(api.getCoach).toHaveBeenCalledWith(9);
  });

  it("keeps the rule-based coach, without any error screen, when the AI fails", async () => {
    vi.mocked(api.getCoach).mockResolvedValue({ ...ruleBased, ai_status: "failed", fallback: true });
    renderCard();
    await screen.findByText(coach.headline);
    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(screen.queryByText(/adding more detail/)).toBeNull());
    expect(screen.getByText(coach.headline)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores a failed poll and keeps waiting", async () => {
    vi.mocked(api.getCoach).mockRejectedValueOnce(new api.ApiError(0, "offline")).mockResolvedValue(aiVersion);
    renderCard();
    await screen.findByText(coach.headline);
    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.queryByRole("alert")).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await screen.findByText("The detailed AI headline.")).toBeTruthy();
  });

  it("a run whose AI version was already done has no tag and no fade", async () => {
    vi.mocked(api.requestCoach).mockResolvedValue(aiVersion);
    const { container } = renderCard();
    expect(await screen.findByText("The detailed AI headline.")).toBeTruthy();
    expect(screen.queryByText("Updated with more detail")).toBeNull();
    expect(container.querySelector(".coach-fade")).toBeNull();
  });
});
