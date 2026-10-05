import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import * as events from "../../lib/events";
import { rememberBusiness } from "../../lib/session";
import { makeHow, makeRun, makeToday } from "../../test-fixtures";
import { SharePage } from "./SharePage";
import { SharePlanChart } from "./SharePlanChart";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, getSummary: vi.fn(), getHow: vi.fn(), listSimulationRuns: vi.fn(), getSimulationRun: vi.fn(),
    getToday: vi.fn(), getTodayNote: vi.fn(), requestCoach: vi.fn(), askCoach: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

const RUNS: api.SimulationRunSummaryOut[] = [{
  id: 2, business_id: 1, engine_version: "0.1.0", seed: 7, iterations: 1000, horizon: 12, created_at: "2026-10-05T10:00:00",
  scenario_names: ["baseline", "Raise prices by 13% from November 2026"],
}];
const SCENARIO = "Raise prices by 13% from November 2026";

function mount(search = "") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[`/share${search}`]}>
      <Routes>
        <Route path="/share" element={<SharePage />} />
        <Route path="*" element={<p>Somewhere else</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const sheet = () => within(screen.getByRole("article"));
const css = () => readFileSync(resolve(process.cwd(), "src", "beginner.css"), "utf-8");

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  rememberBusiness(1);
  window.print = vi.fn();
  vi.mocked(api.getSummary).mockResolvedValue(makeToday({ note: null }));
  vi.mocked(api.getHow).mockResolvedValue(makeHow());
  vi.mocked(api.listSimulationRuns).mockResolvedValue(RUNS);
  vi.mocked(api.getSimulationRun).mockResolvedValue(makeRun());
});

afterEach(() => vi.restoreAllMocks());

describe("Share: the one-page summary", () => {
  it("has the business name, the date, and where things stand today", async () => {
    mount();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("My café: plan summary");
    expect(sheet().getByText(/^Prepared on /)).toBeTruthy();
    const today = within(screen.getByRole("region", { name: "Where the business stands today" }));
    expect(today.getByRole("heading", { name: "What you keep each month" })).toBeTruthy();
    expect(today.getByText("$5,820")).toBeTruthy();
    expect(today.getByRole("heading", { name: "Your safety net" })).toBeTruthy();
    expect(today.getAllByText("$51,400").length).toBeGreaterThanOrEqual(1);       // the bank today, and the lowest point
    expect(today.getByRole("heading", { name: "Your lowest cash point" })).toBeTruthy();
  });

  it("has the 12-month charts, as pictures with a spoken description", async () => {
    mount();
    await screen.findByRole("article");
    const pics = within(screen.getByRole("region", { name: "The next 12 months, if you change nothing" })).getAllByRole("img");
    expect(pics).toHaveLength(2);
    expect(pics[0].getAttribute("aria-label")).toMatch(/^What you keep each month, month by month\. Most likely \$5,800 in Nov 2026/);
    expect(pics[1].getAttribute("aria-label")).toMatch(/^Cash in the bank, month by month\./);
    expect(pics[0].getAttribute("aria-label")).toMatch(/bad case .*good case/);
  });

  it("lists the owner's own numbers and the assumed ones separately", async () => {
    mount();
    await screen.findByRole("article");
    const built = within(screen.getByRole("region", { name: "What this is built on" }));
    expect(built.getByRole("heading", { name: "Numbers the owner gave" })).toBeTruthy();
    expect(built.getByText(/Monthly rent:/)).toBeTruthy();
    expect(built.getByRole("heading", { name: "Numbers we assumed" })).toBeTruthy();
    expect(built.getByText(/Cash in the bank:/).textContent).toContain("two months of your monthly costs");
    expect(built.getByText(/1,000 possible futures/)).toBeTruthy();
  });

  it("contains the 'scenarios, not forecasts' disclaimer and says nothing was sent anywhere", async () => {
    mount();
    await screen.findByRole("article");
    expect(sheet().getByText("Scenarios, not forecasts. Built from typical numbers and the ones you gave us. Not financial advice.")).toBeTruthy();
    expect(sheet().getByText(/Nothing in this summary has been sent anywhere/)).toBeTruthy();
  });

  it("says plainly when it is a sample business", async () => {
    vi.mocked(api.getSummary).mockResolvedValue(makeToday({ is_sample: true, note: null }));
    mount();
    await screen.findByRole("article");
    expect(sheet().getByText(/This is a sample café: the numbers are examples, not a real business/)).toBeTruthy();
  });

  it("uses the plain summary: no coach, no AI", async () => {
    mount();
    await screen.findByRole("article");
    expect(api.getSummary).toHaveBeenCalledWith(1);
    expect(api.getToday).not.toHaveBeenCalled();
    expect(api.getTodayNote).not.toHaveBeenCalled();
    expect(api.requestCoach).not.toHaveBeenCalled();
    expect(api.askCoach).not.toHaveBeenCalled();
    expect(screen.queryByText(/Your coach/)).toBeNull();
  });

  it("uses the business currency", async () => {
    vi.mocked(api.getSummary).mockResolvedValue(makeToday({ currency: "EUR", note: null }));
    mount();
    await screen.findByRole("article");
    expect(sheet().getByText("€5,820")).toBeTruthy();
  });
});

describe("Share: print", () => {
  it("has a Print or save as PDF button that opens the browser's print window, and nothing else leaves the computer", async () => {
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Print or save as PDF" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(events.track).toHaveBeenCalledWith("print_clicked", "share");
    expect(screen.getByText(/Nothing is sent anywhere/)).toBeTruthy();
  });

  it("the controls are marked to be left out of the printout, the summary is not", async () => {
    mount();
    const button = await screen.findByRole("button", { name: "Print or save as PDF" });
    expect(button.closest(".no-print")).toBeTruthy();
    expect(screen.getByRole("article").closest(".no-print")).toBeNull();
    expect(screen.getByRole("article").querySelector("button, select")).toBeNull();
  });

  it("the print styles hide the top bar, the Back button and the controls", () => {
    const sheetCss = css();
    const print = sheetCss.slice(sheetCss.indexOf("@media print"));
    const hidden = /\.appnav,[\s\S]*?\.back-button,[\s\S]*?\.no-print[\s\S]*?\{\s*display:\s*none\s*!important/.exec(print);
    expect(hidden).toBeTruthy();
    expect(print).toMatch(/\.skip-link/);
    expect(print).toMatch(/\.undo-region/);
  });

  it("the print styles are black on white with nothing cut off", () => {
    const sheetCss = css();
    const print = sheetCss.slice(sheetCss.indexOf("@media print"));
    expect(print).toMatch(/background:\s*#ffffff\s*!important/);
    expect(print).toMatch(/color:\s*#000000\s*!important/);
    expect(print).toMatch(/break-inside:\s*avoid/);
    expect(print).toMatch(/\.plan-chart\s*\{[^}]*width:\s*100%/);
    expect(print).toMatch(/\.plan-chart\s*\{[^}]*max-height:/);
    expect(print).toMatch(/\.share-sheet\s*\{[^}]*max-width:\s*none/);
  });

  it("sets A4 page margins that look good", () => {
    expect(css()).toMatch(/@page\s*\{[^}]*size:\s*A4;[^}]*margin:\s*16mm 14mm/);
  });
});

describe("Share: with the change vs if you change nothing", () => {
  it("offers the saved scenarios in a list, starting with none", async () => {
    mount();
    const select = (await screen.findByLabelText("Add a saved scenario to compare (optional)")) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "None: just show where things stand today", `${SCENARIO} (run #2)`,
    ]);
    expect(screen.queryByRole("region", { name: /and without it/ })).toBeNull();
  });

  it("choosing one adds the comparison table and chart", async () => {
    const { user } = mount();
    await user.selectOptions(await screen.findByLabelText("Add a saved scenario to compare (optional)"), `2|${SCENARIO}`);
    const compare = within(await screen.findByRole("region", { name: `With “${SCENARIO}” and without it` }));
    expect(api.getSimulationRun).toHaveBeenCalledWith(2);
    const table = within(compare.getByRole("table"));
    expect(table.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Measure", "With the change", "If you change nothing"]);
    const row = (name: RegExp) => within(table.getByRole("row", { name }));
    expect(row(/What you keep over 12 months/).getByText("$82,800")).toBeTruthy();
    expect(row(/What you keep over 12 months/).getByText("$67,000")).toBeTruthy();
    expect(row(/Cash in the bank at the end/).getByText("$112,000")).toBeTruthy();
    expect(row(/Comes out ahead/).getByText("9 of 10 possible futures")).toBeTruthy();
    expect(compare.getByRole("img").getAttribute("aria-label")).toMatch(/with the change/);
    expect(compare.getByRole("img").querySelector(".plan-baseline")).toBeTruthy();
  });

  it("the address can pick it: ?run=2 opens with the comparison already there", async () => {
    mount("?run=2");
    expect(await screen.findByRole("region", { name: `With “${SCENARIO}” and without it` })).toBeTruthy();
    expect((screen.getByLabelText("Add a saved scenario to compare (optional)") as HTMLSelectElement).value).toBe(`2|${SCENARIO}`);
  });

  it("going back to 'none' removes the comparison", async () => {
    const { user } = mount("?run=2");
    await screen.findByRole("region", { name: /and without it/ });
    await user.selectOptions(screen.getByLabelText("Add a saved scenario to compare (optional)"), "");
    await waitFor(() => expect(screen.queryByRole("region", { name: /and without it/ })).toBeNull());
  });

  it("with no saved scenarios it points to Try a change instead of an empty list", async () => {
    vi.mocked(api.listSimulationRuns).mockResolvedValue([]);
    mount();
    await screen.findByRole("article");
    expect(screen.queryByLabelText("Add a saved scenario to compare (optional)")).toBeNull();
    expect(screen.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
  });

  it("if that scenario cannot load, says so calmly and keeps the summary", async () => {
    vi.mocked(api.getSimulationRun).mockRejectedValue(new api.ApiError(500, "boom"));
    mount("?run=2");
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load that scenario just now");
    expect(screen.getByRole("article")).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
  });
});

describe("Share: states, phone and accessibility", () => {
  it("goes to the start screen when no business is chosen", async () => {
    window.sessionStorage.clear();
    mount();
    expect(await screen.findByText("Somewhere else")).toBeTruthy();
    expect(api.getSummary).not.toHaveBeenCalled();
  });

  it("shows a calm waiting line, then a friendly failure with Try again", async () => {
    vi.mocked(api.getSummary).mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error")).mockResolvedValue(makeToday({ note: null }));
    const { user } = mount();
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load your summary");
    expect(screen.queryByText(/Internal Server Error/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article")).toBeTruthy();
  });

  it("says what to do when the program is not running", async () => {
    vi.mocked(api.getSummary).mockRejectedValue(new api.ApiError(0, "Could not reach the API. Is the backend running on http://localhost:8000?"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("We can't reach the program that does the sums");
  });

  it("is one column on a phone and has big touch targets (stylesheet)", () => {
    const sheetCss = css();
    expect(sheetCss).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.share-facts\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(sheetCss).toMatch(/\.share-controls button\s*\{[^}]*min-height:\s*48px/);
  });

  it("has no automatic accessibility violations, with and without a comparison", async () => {
    const { container, user } = mount();
    await screen.findByRole("article");
    expect((await axe(container)).violations).toEqual([]);
    await user.selectOptions(screen.getByLabelText("Add a saved scenario to compare (optional)"), `2|${SCENARIO}`);
    await screen.findByRole("region", { name: /and without it/ });
    expect((await axe(container)).violations).toEqual([]);
  });

  it("the print button and the picker can be reached with the keyboard", async () => {
    const { user } = mount();
    await screen.findByRole("article");
    const reached = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await user.tab();
      reached.add(document.activeElement?.tagName ?? "");
    }
    expect(reached.has("BUTTON")).toBe(true);
    expect(reached.has("SELECT")).toBe(true);
    screen.getByRole("button", { name: "Print or save as PDF" }).focus();
    await user.keyboard("{Enter}");
    expect(window.print).toHaveBeenCalled();
  });

  it("uses no browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount("?run=2");
    await screen.findByRole("region", { name: /and without it/ });
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("SharePlanChart", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: `Month ${i + 1}`, p10: 100 + i, p50: 150 + i, p90: 200 + i, baseline: 140 + i }));

  it("is a picture with a description, a band, a median line, a dashed baseline and labelled axes", () => {
    const { container } = render(<SharePlanChart rows={rows} format={(v) => `$${Math.round(v)}`} label="A description" />);
    const svg = screen.getByRole("img", { name: "A description" });
    expect(svg.getAttribute("viewBox")).toBe("0 0 720 240");
    expect(container.querySelector(".plan-band")).toBeTruthy();
    expect(container.querySelector(".plan-median")).toBeTruthy();
    expect(container.querySelector(".plan-baseline")).toBeTruthy();
    const labels = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(labels).toContain("Month 1");
    expect(labels).toContain("Month 12");
    expect(labels.filter((l) => l?.startsWith("$"))).toHaveLength(3);
  });

  it("draws no baseline line when there is none", () => {
    const { container } = render(<SharePlanChart rows={rows.map(({ baseline: _b, ...r }) => r)} format={String} label="x" />);
    expect(container.querySelector(".plan-baseline")).toBeNull();
  });
});
