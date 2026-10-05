import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { App } from "./App";
import { UndoProvider } from "./components/UndoProvider";
import { rememberBusiness } from "./lib/session";
import { makeSketch, makeToday } from "./test-fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual, listBusinesses: vi.fn(), listIndustries: vi.fn(), getBusiness: vi.fn(), getToday: vi.fn(), getTodayNote: vi.fn(),
    getStartOptions: vi.fn(), previewChange: vi.fn(),
  };
});
vi.mock("./lib/events", () => ({ track: vi.fn() }));
vi.mock("./pages/Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));
vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box, ComposedChart: Box, Area: () => null, Line: () => null, CartesianGrid: () => null, XAxis: () => null,
    YAxis: () => null, Tooltip: () => null, ReferenceLine: () => null,
  };
});

const BUSINESS: api.BusinessOut = {
  id: 1, name: "noah", industry: "cafe", currency: "USD", created_at: "x", setup_source: "full", is_sample: false, baseline: null,
};

function open(path: string, entries?: string[]) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <MemoryRouter initialEntries={entries ?? [path]} initialIndex={(entries ?? [path]).length - 1}>
      <UndoProvider>
        <App />
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const css = () => readFileSync(resolve(process.cwd(), "src", "beginner.css"), "utf-8");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  rememberBusiness(1);
  vi.mocked(api.listBusinesses).mockResolvedValue([BUSINESS]);
  vi.mocked(api.listIndustries).mockResolvedValue([]);
  vi.mocked(api.getBusiness).mockResolvedValue(BUSINESS);
  vi.mocked(api.getToday).mockResolvedValue(makeToday({ business_id: 1, name: "noah" }));
  vi.mocked(api.getStartOptions).mockResolvedValue({
    options: [
      { key: "next", label: "Next month", month: 1, name: "November 2026" },
      { key: "in3", label: "In 3 months", month: 3, name: "January 2027" },
      { key: "spring", label: "In spring", month: 5, name: "March 2027" },
    ],
  });
  vi.mocked(api.previewChange).mockImplementation((_id, body) => Promise.resolve(makeSketch({ amount: body.amount, start_month: body.start_month })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("both new pages sit inside the shared layout", () => {
  for (const [path, title] of [["/try", "What if you changed your prices?"], ["/timeline", "The next 12 months"]] as const) {
    it(`${path} has the top bar and the Back button above the title`, async () => {
      open(path);
      await settle();
      const nav = screen.getByRole("navigation", { name: "Main" });
      const back = screen.getByRole("button", { name: "Go back" });
      const h1 = screen.getByRole("heading", { level: 1, name: title });
      expect(nav.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(back.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(back.closest("main")).toBe(h1.closest("main"));
    });

    it(`${path} says "just a sketch" on the live numbers`, async () => {
      open(path);
      await settle();
      expect(screen.getAllByText("Just a sketch").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Nothing is saved/).length).toBeGreaterThan(0);
    });

    it(`${path} has no accessibility violations inside the whole app`, async () => {
      const { container } = open(path);
      await settle();
      expect((await axe(container)).violations).toEqual([]);
    });
  }
});

describe("the nav and the links between the pages", () => {
  it("'Try a change' in the top bar goes to the Try page and is marked as the current page there", async () => {
    const { user } = open("/today");
    await settle();
    const link = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Try a change" });
    expect(link.getAttribute("href")).toBe("/try");
    await user.click(link);
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "What if you changed your prices?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try a change" }).className).toContain("active");
  });

  it("the Today page's own 'Try a change' link goes there too", async () => {
    const { user } = open("/today");
    await settle();
    const inPage = within(screen.getByRole("main")).getByRole("link", { name: "Try a change" });
    expect(inPage.getAttribute("href")).toBe("/try");
    await user.click(inPage);
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "What if you changed your prices?" })).toBeTruthy();
  });

  it("the old scenario builder is still there, under Advanced", async () => {
    open("/today");
    await settle();
    const advanced = screen.getByRole("link", { name: "Scenario builder", hidden: true });
    expect(advanced.getAttribute("href")).toBe("/scenarios");
  });

  it("'Watch the next 12 months' goes to the timeline for the same change, and Back returns to Try", async () => {
    const { user } = open("/try");
    await settle();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "12" } });
    await settle(250);
    await user.click(screen.getByRole("button", { name: "In 3 months" }));
    await settle(250);
    await user.click(screen.getByRole("link", { name: "Watch the next 12 months →" }));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "The next 12 months" })).toBeTruthy();
    expect(vi.mocked(api.previewChange).mock.calls.at(-1)![1]).toEqual({ type: "price", amount: 12, start_month: 3 });
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "What if you changed your prices?" })).toBeTruthy();
  });

  it("Back from Try with nothing before it goes to Today", async () => {
    const { user } = open("/try");
    await settle();
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await settle();
    expect(screen.getByRole("heading", { name: "Today at noah" })).toBeTruthy();
  });

  it("with no business chosen, both pages send you to the start screen", async () => {
    for (const path of ["/try", "/timeline"]) {
      window.sessionStorage.clear();
      const { unmount } = open(path);
      await settle();
      expect(screen.getByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
      unmount();
    }
  });
});

describe("phone width and keyboard", () => {
  it("both pages collapse to one column and have big touch targets in the stylesheet", () => {
    const sheet = css();
    expect(sheet).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.try-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(sheet).toMatch(/\.try-start\s*\{[^}]*min-height:\s*44px/);
    expect(sheet).toMatch(/\.try-watch\s*\{[^}]*min-height:\s*52px/);
    expect(sheet).toMatch(/\.timeline-compare\s*\{[^}]*min-height:\s*44px/);
    expect(sheet).toMatch(/\.try-slider::-webkit-slider-thumb\s*\{[^}]*width:\s*32px/);
    expect(sheet).toMatch(/\.try-slider\s*\{[^}]*height:\s*44px/);
    expect(sheet).toMatch(/\.back-button\s*\{[^}]*min-height:\s*44px/);
  });

  it("the time slider and the compare switch can be used with the keyboard", async () => {
    const { user } = open("/timeline");
    await settle();
    const slider = screen.getByRole("slider", { name: "Pick a month" });
    slider.focus();
    expect(document.activeElement).toBe(slider);
    fireEvent.change(slider, { target: { value: "4" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("Month 4, Feb 2027");
    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
  });
});
