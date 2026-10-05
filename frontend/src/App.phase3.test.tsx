import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { App } from "./App";
import { UndoProvider } from "./components/UndoProvider";
import { getRememberedBusinessId, rememberBusiness } from "./lib/session";
import { makeHow, makeRun, makeToday } from "./test-fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual, listBusinesses: vi.fn(), listIndustries: vi.fn(), listScenarios: vi.fn(), listSimulationRuns: vi.fn(), getSimulationRun: vi.fn(),
    getToday: vi.fn(), getTodayNote: vi.fn(), getBusinessImpact: vi.fn(), getHow: vi.fn(), getSummary: vi.fn(),
  };
});
vi.mock("./lib/events", () => ({ track: vi.fn() }));
vi.mock("./pages/Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));
vi.mock("./components/CoachCard", () => ({ CoachCard: () => <p>The coach card</p> }));
vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box, ComposedChart: Box, Area: () => null, Line: () => null, CartesianGrid: () => null, XAxis: () => null,
    YAxis: () => null, Tooltip: () => null, Legend: () => null, ReferenceLine: () => null,
  };
});

const BUSINESS: api.BusinessOut = {
  id: 1, name: "noah", industry: "cafe", currency: "USD", created_at: "x", setup_source: "quick", is_sample: false, baseline: null,
};
const RUN_SUMMARY: api.SimulationRunSummaryOut = {
  id: 2, business_id: 1, engine_version: "0.1.0", seed: 7, iterations: 1000, horizon: 12, created_at: "2026-10-05T10:00:00",
  scenario_names: ["baseline", "Raise prices by 13% from November 2026"],
};
const UNREACHABLE = new api.ApiError(0, "Could not reach the API. Is the backend running on http://localhost:8000?");

function open(path: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <App />
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  rememberBusiness(1);
  window.print = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.listBusinesses).mockResolvedValue([BUSINESS]);
  vi.mocked(api.listIndustries).mockResolvedValue([]);
  vi.mocked(api.listScenarios).mockResolvedValue([]);
  vi.mocked(api.listSimulationRuns).mockResolvedValue([RUN_SUMMARY]);
  vi.mocked(api.getSimulationRun).mockResolvedValue(makeRun());
  vi.mocked(api.getToday).mockResolvedValue(makeToday({ business_id: 1, name: "noah" }));
  vi.mocked(api.getSummary).mockResolvedValue(makeToday({ business_id: 1, name: "noah", note: null }));
  vi.mocked(api.getHow).mockResolvedValue(makeHow());
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 1, runs: 1 });
});

afterEach(() => vi.restoreAllMocks());

describe("the new pages sit inside the shared layout", () => {
  for (const [path, title] of [["/how", "How we worked it out"], ["/share", "noah: plan summary"]] as const) {
    it(`${path} has the top bar and the Back button above the content`, async () => {
      open(path);
      const h1 = await screen.findByRole("heading", { level: 1, name: title });
      const back = screen.getByRole("button", { name: "Go back" });
      const nav = screen.getByRole("navigation", { name: "Main" });
      expect(nav.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(back.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it(`${path} has no accessibility violations inside the whole app`, async () => {
      const { container } = open(path);
      await screen.findByRole("heading", { level: 1, name: title });
      expect((await axe(container)).violations).toEqual([]);
    });

    it(`${path} sends you to the start screen when no business is chosen`, async () => {
      window.sessionStorage.clear();
      open(path);
      expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
    });
  }

  it("the top bar is Today, Try a change, My journal, Advanced", async () => {
    open("/how");
    await screen.findByRole("heading", { level: 1 });
    const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link").filter((l) => !l.closest("details"));
    expect(links.map((l) => l.textContent)).toEqual(["Business Time Machine", "Today", "Try a change", "My journal"]);
    expect(screen.getByText("Advanced")).toBeTruthy();
  });
});

describe("how to get there", () => {
  it("Today has 'How did we get these numbers?' and 'Print or share this summary'", async () => {
    const { user } = open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "Print or share this summary" }).getAttribute("href")).toBe("/share");
    await user.click(main.getByRole("link", { name: "How did we get these numbers?" }));
    expect(await screen.findByRole("heading", { level: 1, name: "How we worked it out" })).toBeTruthy();
  });

  it("a saved result links to both pages and shares that very run", async () => {
    const { user } = open("/history?business=1&run=2");
    expect(await screen.findByText("The coach card")).toBeTruthy();
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "How did we get these numbers?" }).getAttribute("href")).toBe("/how");
    const share = main.getByRole("link", { name: "Print or share this result" });
    expect(share.getAttribute("href")).toBe("/share?run=2");
    await user.click(share);
    expect(await screen.findByRole("region", { name: /and without it/ })).toBeTruthy();
  });

  it("opening a result of another business makes that the open business first", async () => {
    vi.mocked(api.getSimulationRun).mockResolvedValue(makeRun({ business_id: 3 }));
    rememberBusiness(1);
    const { user } = open("/history?business=3&run=2");
    await screen.findByText("The coach card");
    await user.click(within(screen.getByRole("main")).getByRole("link", { name: "Print or share this result" }));
    expect(getRememberedBusinessId()).toBe(3);
  });

  it("'Change this' on the how-page goes to the assumed list on Today and scrolls to it", async () => {
    const { user } = open("/how");
    await screen.findByRole("heading", { level: 1, name: "How we worked it out" });
    await user.click(screen.getByRole("link", { name: "Change Cash in the bank" }));
    expect(await screen.findByRole("heading", { name: "Today at noah" })).toBeTruthy();
    expect(document.getElementById("assumed")).toBeTruthy();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});

describe("empty states: each shows its one next step", () => {
  it("Compare with no scenarios", async () => {
    vi.mocked(api.listScenarios).mockResolvedValue([]);
    open("/compare?business=1");
    const box = within(await screen.findByRole("region", { name: "No scenarios yet" }));
    expect(box.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
    expect(box.getByRole("link", { name: "Describe one in your own words" }).getAttribute("href")).toBe("/scenarios");
    expect(box.getByText(/A scenario is one idea you want to test/)).toBeTruthy();
  });

  it("the scenario builder with no scenarios", async () => {
    open("/scenarios?business=1");
    const box = within(await screen.findByRole("region", { name: "No scenarios yet" }));
    expect(box.getByRole("link", { name: "Or use the sliders on Try a change" }).getAttribute("href")).toBe("/try");
  });

  it("run history with no runs", async () => {
    vi.mocked(api.listSimulationRuns).mockResolvedValue([]);
    open("/history?business=1");
    const box = within(await screen.findByRole("region", { name: "No runs yet" }));
    expect(box.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
    expect(box.getByRole("link", { name: "Compare scenarios" }).getAttribute("href")).toBe("/compare");
  });

  for (const path of ["/compare", "/history", "/scenarios"]) {
    it(`${path} with no businesses at all`, async () => {
      vi.mocked(api.listBusinesses).mockResolvedValue([]);
      open(path);
      const box = within(await screen.findByRole("region", { name: "No businesses yet" }));
      expect(box.getByRole("link", { name: "Set up a business" }).getAttribute("href")).toBe("/");
      expect(screen.queryByRole("combobox", { name: "Business" })).toBeNull();
    });
  }

  it("Today for a new business with nothing saved", async () => {
    vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 0, runs: 0 });
    open("/today");
    const box = within(await screen.findByRole("region", { name: "You haven't tried a change yet" }));
    expect(box.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
    expect(screen.queryByText("Thinking about a change?")).toBeNull();
  });

  it("Today does not say that once something is saved", async () => {
    open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    await waitFor(() => expect(api.getBusinessImpact).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "You haven't tried a change yet" })).toBeNull();
    expect(screen.getByText("Thinking about a change?")).toBeTruthy();
  });

  it("Today says nothing about it if the count cannot be loaded", async () => {
    vi.mocked(api.getBusinessImpact).mockRejectedValue(UNREACHABLE);
    open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    expect(screen.queryByRole("region", { name: "You haven't tried a change yet" })).toBeNull();
  });

  it("the empty states have no accessibility problems", async () => {
    vi.mocked(api.listSimulationRuns).mockResolvedValue([]);
    const { container } = open("/history?business=1");
    await screen.findByRole("region", { name: "No runs yet" });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("failed loads: a calm message and Try again, never a raw error or a blank page", () => {
  it("the list of businesses fails, then Try again works", async () => {
    vi.mocked(api.listBusinesses).mockRejectedValue(new api.ApiError(500, "Internal Server Error"));
    const { user } = open("/compare?business=1");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load your businesses");
    expect(alert.textContent).not.toContain("Internal Server Error");
    vi.mocked(api.listBusinesses).mockResolvedValue([BUSINESS]);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("We couldn't load your businesses")).toBeNull());
    expect(await screen.findByRole("combobox", { name: "Business" })).toBeTruthy();
  });

  it("scenarios fail to load", async () => {
    vi.mocked(api.listScenarios).mockRejectedValue(new api.ApiError(500, "boom"));
    open("/compare?business=1");
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load your scenarios");
  });

  it("the run history fails to load", async () => {
    vi.mocked(api.listSimulationRuns).mockRejectedValue(new api.ApiError(500, "boom"));
    open("/history?business=1");
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load your run history");
  });

  it("the program is not running: Today says what to do, calmly", async () => {
    vi.mocked(api.getToday).mockRejectedValue(UNREACHABLE);
    open("/today");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We can't reach the program that does the sums");
    expect(alert.textContent).toContain("start.ps1");
    expect(alert.textContent).not.toContain("localhost");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Start fresh" })).toBeTruthy();
  });

  it("the program is not running: the run history says the same", async () => {
    vi.mocked(api.listSimulationRuns).mockRejectedValue(UNREACHABLE);
    open("/history?business=1");
    expect((await screen.findByRole("alert")).textContent).toContain("We can't reach the program that does the sums");
  });

  it("a page that breaks while drawing shows a message, not a blank page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getHow).mockResolvedValue({ ...makeHow(), assumed: null } as unknown as api.HowOut);
    open("/how");
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong on this page");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();       // the top bar is still there
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeTruthy();
  });

  it("moving to another page after a break works again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getHow).mockResolvedValue({ ...makeHow(), assumed: null } as unknown as api.HowOut);
    const { user } = open("/how");
    await screen.findByText("Something went wrong on this page");
    await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "Today at noah" })).toBeTruthy();
    await act(async () => undefined);
  });
});
