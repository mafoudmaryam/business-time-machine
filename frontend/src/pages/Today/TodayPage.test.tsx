import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { forgetBusiness, getRememberedBusinessId, markTourSeen, rememberBusiness, tourSeen } from "../../lib/session";
import { makeToday } from "../../test-fixtures";
import { TodayPage } from "./TodayPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, getToday: vi.fn(), getTodayNote: vi.fn(), changeNumbers: vi.fn() };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));
vi.mock("./TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));
vi.mock("../../components/AskCoach", () => ({ AskCoach: ({ runId }: { runId: number }) => <p>Ask box for run {runId}</p> }));

const config = vi.hoisted(() => ({ coachEnabled: true }));
vi.mock("../../components/config", () => ({
  useConfig: () => ({ coachEnabled: config.coachEnabled, studyMode: false, loaded: true }),
}));

function mount(path = "/today") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/" element={<p>Start page</p>} />
        <Route path="/scenarios" element={<p>Builder page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  config.coachEnabled = true;
  markTourSeen(); // most tests are not about the tour
  rememberBusiness(1);
  vi.mocked(api.getToday).mockResolvedValue(makeToday());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Today: the coach speaks first", () => {
  it("shows the coach's words at the top, then three tiles, the chart and what was assumed", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Today at My café" })).toBeTruthy();
    const coach = screen.getByRole("region", { name: "Your coach says" });
    expect(coach.textContent).toContain("you keep about $5,820");
    // The coach comes before the tiles in the page.
    const tiles = screen.getByRole("heading", { name: /What you keep each month/ });
    expect(coach.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Your safety net/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Your lowest cash point/ })).toBeTruthy();
    expect(screen.getByText("The chart")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What we assumed" })).toBeTruthy();
  });

  it("puts the Ask box behind a small link", async () => {
    const { user } = mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByText(/Ask box for run/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ask a question" }));
    const dialog = screen.getByRole("dialog", { name: "Ask a question" });
    expect(within(dialog).getByText("Ask box for run 10")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with the coach switched off (no note) shows the numbers but no coach and no Ask link", async () => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday({ note: null }));
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByRole("region", { name: "Your coach says" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
    expect(screen.getByRole("heading", { name: /What you keep each month/ })).toBeTruthy();
  });

  it("also hides the coach when the app settings say it is off", async () => {
    config.coachEnabled = false;
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByRole("region", { name: "Your coach says" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
  });

  it("labels a sample business with a tag and a way to start with your own numbers", async () => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday({ is_sample: true, name: "Sample café" }));
    const { user } = mount();
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(within(heading).getByText("Sample business")).toBeTruthy();
    expect(screen.getByText(/sample café: example numbers, not a real business/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start with my own numbers" }));
    expect(await screen.findByText("Start page")).toBeTruthy();
  });

  it("shows no sample tag for a real business", async () => {
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByText("Sample business")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start with my own numbers" })).toBeNull();
  });

  it("shows the disclaimer", async () => {
    mount();
    expect((await screen.findByText(/Scenarios, not forecasts/)).textContent).toContain("Not financial advice");
  });

  it("links to Try a change for this business", async () => {
    mount();
    const link = await screen.findByRole("link", { name: "Try a change" });
    expect(link.getAttribute("href")).toBe("/scenarios?business=1");
  });
});

describe("Today: the better note arrives later", () => {
  const pending = () => makeToday({ note: { ...makeToday().note!, ai_status: "pending" } });

  it("shows the rule-based note at once with a calm progress line, then swaps in the AI version", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getToday).mockResolvedValue(pending());
    vi.mocked(api.getTodayNote)
      .mockResolvedValueOnce({ ...pending().note! })
      .mockResolvedValue({ ...pending().note!, text: "A warmer, fuller note.", ai_status: "done", mode: "ollama" });
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.getByRole("status").textContent).toContain("Your coach is adding more detail");
    expect(screen.getByText(/you keep about \$5,820/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText(/you keep about \$5,820/)).toBeTruthy(); // still pending: nothing changed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText("A warmer, fuller note.")).toBeTruthy();
    expect(screen.getByText("Updated with more detail")).toBeTruthy();
    expect(screen.queryByText(/adding more detail/)).toBeNull();
    expect(api.getTodayNote).toHaveBeenCalledTimes(2);
  });

  it("keeps the rule-based note, with no error, when the AI fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getToday).mockResolvedValue(pending());
    vi.mocked(api.getTodayNote).mockResolvedValue({ ...pending().note!, ai_status: "failed", fallback: true });
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText(/you keep about \$5,820/)).toBeTruthy();
    expect(screen.queryByText("Updated with more detail")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getTodayNote).toHaveBeenCalledTimes(1); // polling stopped
  });

  it("ignores a failed poll and keeps what it has", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getToday).mockResolvedValue(pending());
    vi.mocked(api.getTodayNote).mockRejectedValue(new Error("down"));
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText(/you keep about \$5,820/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not poll when no AI is writing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getTodayNote).not.toHaveBeenCalled();
  });
});

describe("Today: the first-time tour", () => {
  it("opens the first time, and is not shown again once skipped", async () => {
    window.localStorage.removeItem("btm.tourSeen");
    const { user, unmount } = mount();
    const tour = await screen.findByRole("dialog", { name: "A quick look around" });
    expect(within(tour).getByText("Step 1 of 3")).toBeTruthy();
    await user.click(within(tour).getByRole("button", { name: "Skip tour" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tourSeen()).toBe(true);
    unmount();

    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Today: what we assumed", () => {
  it("lists the main guesses first and the rest behind a fold", async () => {
    mount();
    const panel = within(await screen.findByRole("region", { name: "What we assumed" }));
    expect(panel.getByText("Cash in the bank:")).toBeTruthy();
    expect(panel.getByText("$51,400")).toBeTruthy();
    expect(panel.getByText(/two months of your monthly costs/)).toBeTruthy();
    expect(panel.getByText("More typical values (1)")).toBeTruthy();
  });

  it("lets the owner change a guess; it is sent to the server and the page reloads", async () => {
    vi.mocked(api.changeNumbers).mockResolvedValue({} as api.BusinessOut);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Change Cash in the bank" }));
    const field = screen.getByLabelText(/Cash in the bank/);
    await user.clear(field);
    await user.type(field, "40000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.changeNumbers).toHaveBeenCalledWith(1, { cash: 40000 });
    expect(api.getToday).toHaveBeenCalledTimes(2);
  });

  it("sends percent guesses as ratios", async () => {
    vi.mocked(api.changeNumbers).mockResolvedValue({} as api.BusinessOut);
    const { user } = mount();
    await user.click(await screen.findByText("More typical values (1)"));
    await user.click(screen.getByRole("button", { name: "Change Regulars who stop coming each month" }));
    const field = screen.getByLabelText(/Regulars who stop coming each month/);
    expect((field as HTMLInputElement).value).toBe("5");
    await user.clear(field);
    await user.type(field, "8");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const sent = vi.mocked(api.changeNumbers).mock.calls[0][1];
    expect(sent.churn_rate).toBeCloseTo(0.08, 10);
  });

  it("does not save nonsense and says why", async () => {
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Change Cash in the bank" }));
    await user.clear(screen.getByLabelText(/Cash in the bank/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a number.")).toBeTruthy();
    expect(api.changeNumbers).not.toHaveBeenCalled();
  });

  it("can be cancelled without saving", async () => {
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Change Cash in the bank" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Change Cash in the bank" })).toBeTruthy();
    expect(api.changeNumbers).not.toHaveBeenCalled();
  });

  it("in another currency warns that the typical amounts are US dollars", async () => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday({ currency: "EUR" }));
    mount();
    expect(await screen.findByText(/are US dollars\. Please change them to your own amounts in EUR/)).toBeTruthy();
  });

  it("is not shown when the owner typed every number", async () => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday({ assumptions: [], assumed_by_app: false }));
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.queryByRole("heading", { name: "What we assumed" })).toBeNull();
  });
});

describe("Today: finding the business", () => {
  it("goes to the start screen when no business is remembered", async () => {
    forgetBusiness();
    mount();
    expect(await screen.findByText("Start page")).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });

  it("does not open a business just because an address names one", async () => {
    forgetBusiness();
    mount("/today?business=7");
    expect(await screen.findByText("Start page")).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });

  it("never opens numbers left over from an older visit (stored for good by an older version)", async () => {
    forgetBusiness();
    window.localStorage.setItem("btm.businessId", "6");
    mount();
    expect(await screen.findByText("Start page")).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });

  it("shows a friendly message, with Try again and Start fresh, when it cannot load", async () => {
    vi.mocked(api.getToday).mockRejectedValue(new api.ApiError(404, "business not found"));
    const { user } = mount();
    expect(await screen.findByRole("heading", { name: "We couldn't open that business" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("business not found");
    await user.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(await screen.findByText("Start page")).toBeTruthy();
    expect(getRememberedBusinessId()).toBeNull();
  });

  it("shows a calm waiting line while loading", () => {
    vi.mocked(api.getToday).mockReturnValue(new Promise(() => undefined));
    mount();
    expect(screen.getByRole("status").textContent).toContain("Your coach is looking at your numbers");
  });
});

describe("Today: accessibility", () => {
  it("has no automatic accessibility violations", async () => {
    const { container } = mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect((await axe(container)).violations).toEqual([]);
  });

  it("has exactly one h1, and the tiles are headed", async () => {
    mount();
    await screen.findByRole("heading", { name: "Today at My café" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThanOrEqual(3);
  });
});
