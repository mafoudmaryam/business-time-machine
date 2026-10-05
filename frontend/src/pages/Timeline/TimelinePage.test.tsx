import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { rememberBusiness } from "../../lib/session";
import { makeSketch } from "../../test-fixtures";
import { TimelinePage } from "./TimelinePage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, getBusiness: vi.fn(), previewChange: vi.fn(), requestCoach: vi.fn(), askCoach: vi.fn() };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));
// Recharts needs a real layout to draw; here only the words and numbers around it matter.
vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box, ComposedChart: Box, Area: () => null, Line: () => null, CartesianGrid: () => null, XAxis: () => null,
    YAxis: () => null, Tooltip: () => null, ReferenceLine: () => null,
  };
});

function mount(search = "") {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <MemoryRouter initialEntries={[`/timeline${search}`]}>
      <Routes>
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="*" element={<p>Somewhere else</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const month = () => screen.getByRole("slider", { name: "Pick a month" }) as HTMLInputElement;
const chooseMonth = (n: number) => fireEvent.change(month(), { target: { value: String(n) } });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  rememberBusiness(1);
  vi.mocked(api.getBusiness).mockResolvedValue({
    id: 1, name: "noah", industry: "cafe", currency: "USD", created_at: "x", setup_source: "full", is_sample: false, baseline: null,
  });
  vi.mocked(api.previewChange).mockImplementation((_id, body) => Promise.resolve(makeSketch({ amount: body.amount, start_month: body.start_month })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("The next 12 months: the page", () => {
  it("goes to the start screen when no business is chosen", async () => {
    window.sessionStorage.clear();
    mount();
    expect(await screen.findByText("Somewhere else")).toBeTruthy();
    expect(api.previewChange).not.toHaveBeenCalled();
  });

  it("has the title, says it is just a sketch, and names the change", async () => {
    mount();
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "The next 12 months" })).toBeTruthy();
    expect(screen.getByText("Just a sketch")).toBeTruthy();
    expect(screen.getByText(/Raise prices by 7% from November 2026 \(month 1\)\. A quick estimate from your own numbers\. Nothing is saved\./)).toBeTruthy();
  });

  it("asks for the change named in the address", async () => {
    mount("?change=price&amount=12&start=3");
    await settle();
    expect(vi.mocked(api.previewChange).mock.calls[0][1]).toEqual({ type: "price", amount: 12, start_month: 3 });
  });

  it("without an address it shows a modest rise starting next month", async () => {
    mount();
    await settle();
    expect(vi.mocked(api.previewChange).mock.calls[0][1]).toEqual({ type: "price", amount: 7, start_month: 1 });
  });

  it("shows a calm message with a way back if it cannot work it out", async () => {
    vi.mocked(api.previewChange).mockRejectedValue(new Error("down"));
    mount();
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We couldn't work that out just now");
    expect(within(alert).getByRole("link", { name: "Go back to Try a change" }).getAttribute("href")).toBe("/try");
  });

  it("never calls the coach or anything AI", async () => {
    mount();
    await settle();
    chooseMonth(5);
    expect(api.requestCoach).not.toHaveBeenCalled();
    expect(api.askCoach).not.toHaveBeenCalled();
  });
});

describe("The next 12 months: the month slider and the three cards", () => {
  it("has a month slider from the first month to the last, with a spoken value", async () => {
    mount();
    await settle();
    expect(month().min).toBe("1");
    expect(month().max).toBe("12");
    expect(month().value).toBe("1");
    expect(month().getAttribute("aria-valuetext")).toBe("Month 1, Nov 2026");
    const ends = within(screen.getByRole("region", { name: "Pick a month" }));
    expect(ends.getAllByText("Nov 2026").length).toBeGreaterThan(0);
    expect(ends.getByText("Oct 2027")).toBeTruthy();
  });

  it("shows what you keep, cash in the bank and regular customers for that month, next to 'if you change nothing'", async () => {
    mount();
    await settle();
    const cards = within(screen.getByRole("group", { name: "Nov 2026: the most likely numbers" }));
    expect(cards.getByRole("heading", { name: "What you keep in Nov 2026" })).toBeTruthy();
    expect(cards.getByText("$6,100")).toBeTruthy();
    expect(cards.getByText("$5,560 if you change nothing.")).toBeTruthy();
    expect(cards.getByRole("heading", { name: "Cash in the bank, end of Nov 2026" })).toBeTruthy();
    expect(cards.getByText("$31,000")).toBeTruthy();
    expect(cards.getByRole("heading", { name: "Regular customers in Nov 2026" })).toBeTruthy();
    expect(cards.getByText("900")).toBeTruthy();
  });

  it("the cards change with the month slider", async () => {
    mount();
    await settle();
    chooseMonth(3);
    expect(month().getAttribute("aria-valuetext")).toBe("Month 3, Jan 2027");
    const cards = within(screen.getByRole("group", { name: "Jan 2027: the most likely numbers" }));
    expect(cards.getByRole("heading", { name: "What you keep in Jan 2027" })).toBeTruthy();
    expect(cards.getByText("$6,116")).toBeTruthy();            // 6100 + 2 months of +8
    expect(cards.getByText("$5,576 if you change nothing.")).toBeTruthy();
    expect(cards.getByText("898")).toBeTruthy();               // 900 - 2
  });

  it("the toggle hides the comparison and brings it back", async () => {
    const { user } = mount();
    await settle();
    const toggle = screen.getByRole("switch", { name: "Compare with “if you change nothing”" }) as HTMLInputElement;
    const cards = () => within(screen.getByRole("group", { name: "Nov 2026: the most likely numbers" }));
    expect(toggle.checked).toBe(true);
    expect(cards().getAllByText(/if you change nothing\./).length).toBe(3);
    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(cards().queryAllByText(/if you change nothing/).length).toBe(0);
    await user.click(toggle);
    expect(cards().getAllByText(/if you change nothing\./).length).toBe(3);
  });

  it("says the lowest cash point in plain words", async () => {
    mount();
    await settle();
    expect(screen.getByText("Your lowest cash point is $31,000, in Nov 2026. That is no lower than what you have in the bank today.")).toBeTruthy();
  });

  it("says when cash dips, naming the month", async () => {
    vi.mocked(api.previewChange).mockResolvedValue(makeSketch({ change: { ...makeSketch().change, lowest_cash_amount: 12000, lowest_cash_month: 5 } }));
    mount();
    await settle();
    expect(screen.getByText("Your lowest cash point is $12,000, in Mar 2027.")).toBeTruthy();
  });

  it("uses the business currency", async () => {
    vi.mocked(api.getBusiness).mockResolvedValue({
      id: 1, name: "noah", industry: "cafe", currency: "EUR", created_at: "x", setup_source: "full", is_sample: false, baseline: null,
    });
    mount();
    await settle();
    const cards = within(screen.getByRole("group", { name: "Nov 2026: the most likely numbers" }));
    expect(cards.getByText("€6,100")).toBeTruthy();
  });
});

describe("The next 12 months: the chart and its numbers", () => {
  it("describes the chart in words for the month picked", async () => {
    mount();
    await settle();
    chooseMonth(3);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "What you keep, month by month. In Jan 2027: most likely $6,116, or $5,576 if you change nothing.",
    );
  });

  it("switches between what you keep, cash and regular customers", async () => {
    const { user } = mount();
    await settle();
    expect(screen.getByRole("button", { name: "What you keep" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Cash in the bank" }));
    expect(screen.getByRole("button", { name: "Cash in the bank" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Cash in the bank, month by month");
    await user.click(screen.getByRole("button", { name: "Regular customers" }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Regular customers, month by month");
  });

  it("offers the numbers as a table: 12 months, bad case, most likely, good case and the baseline", async () => {
    const { user } = mount();
    await settle();
    await user.click(screen.getByText("Show the numbers"));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Month", "Bad case", "Most likely", "Good case", "If you change nothing",
    ]);
    const first = within(table).getByRole("row", { name: /Nov 2026/ });
    expect(first.textContent).toContain("$4,900");
    expect(first.textContent).toContain("$6,100");
    expect(first.textContent).toContain("$7,300");
    expect(first.textContent).toContain("$5,560");
    await user.click(screen.getByRole("switch"));
    expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(4);
  });
});

describe("The next 12 months: keyboard, phone and accessibility", () => {
  it("has no automatic accessibility violations", async () => {
    const { container } = mount();
    await settle();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("the month slider, the toggle and the chart buttons can be reached with Tab", async () => {
    const { user } = mount();
    await settle();
    const reached = new Set<string>();
    for (let i = 0; i < 14; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      reached.add(el.getAttribute("type") === "range" ? "slider" : el.getAttribute("role") === "switch" ? "switch" : (el.textContent ?? ""));
    }
    for (const want of ["slider", "switch", "What you keep", "Cash in the bank", "Regular customers"]) expect(reached.has(want), want).toBe(true);
  });

  it("the toggle works with the keyboard", async () => {
    const { user } = mount();
    await settle();
    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
  });

  it("uses no browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount();
    await settle();
    chooseMonth(6);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
