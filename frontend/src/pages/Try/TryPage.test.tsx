import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { rememberBusiness } from "../../lib/session";
import { makeSketch } from "../../test-fixtures";
import { TryPage } from "./TryPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, getBusiness: vi.fn(), getStartOptions: vi.fn(), previewChange: vi.fn(), createScenario: vi.fn(), simulateBusiness: vi.fn(),
    requestCoach: vi.fn(), askCoach: vi.fn(), getTodayNote: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

const OPTIONS = [
  { key: "next", label: "Next month", month: 1, name: "November 2026" },
  { key: "in3", label: "In 3 months", month: 3, name: "January 2027" },
  { key: "spring", label: "In spring", month: 5, name: "March 2027" },
];

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function mount() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <MemoryRouter initialEntries={["/try"]}>
      <Routes>
        <Route path="/try" element={<TryPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const slider = () => screen.getByRole("slider") as HTMLInputElement;
const drag = async (value: number) => {
  fireEvent.change(slider(), { target: { value: String(value) } });
  await settle(250);
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  rememberBusiness(1);
  vi.mocked(api.getBusiness).mockResolvedValue({
    id: 1, name: "noah", industry: "cafe", currency: "USD", created_at: "x", setup_source: "full", is_sample: false, baseline: null,
  });
  vi.mocked(api.getStartOptions).mockResolvedValue({ options: OPTIONS });
  vi.mocked(api.previewChange).mockImplementation((_id, body) => Promise.resolve(makeSketch({ amount: body.amount, start_month: body.start_month })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Try a change: the page", () => {
  it("goes to the start screen when no business is chosen", async () => {
    window.sessionStorage.clear();
    mount();
    expect(await screen.findByTestId("where")).toBeTruthy();
    expect(api.previewChange).not.toHaveBeenCalled();
  });

  it("has the title, the one-line help, and the left card", async () => {
    mount();
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "What if you changed your prices?" })).toBeTruthy();
    expect(screen.getByText("Move the slider. The answer on the right changes as you drag.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How much would you raise your prices?" })).toBeTruthy();
    expect(screen.getByText("7%")).toBeTruthy();
    expect(screen.getByText("A typical $6.50 visit would cost $6.96.")).toBeTruthy();
    expect(screen.getByText("A tiny nudge")).toBeTruthy();
    expect(screen.getByText("A big jump")).toBeTruthy();
  });

  it("has a big slider from 1 to 15 with a name and a spoken value", async () => {
    mount();
    await settle();
    expect(slider().min).toBe("1");
    expect(slider().max).toBe("15");
    expect(slider().value).toBe("7");
    expect(slider().getAttribute("aria-valuetext")).toBe("7 percent");
    expect(screen.getByRole("slider", { name: "How much would you raise your prices?" })).toBeTruthy();
  });

  it("asks when it would start, with three buttons; the chosen one is pressed", async () => {
    const { user } = mount();
    await settle();
    expect(screen.getByRole("heading", { name: "When would it start?" })).toBeTruthy();
    const buttons = within(screen.getByRole("group", { name: "When would it start?" })).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Next month", "In 3 months", "In spring"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    await user.click(screen.getByRole("button", { name: "In spring" }));
    expect(screen.getByRole("button", { name: "In spring" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Next month" }).getAttribute("aria-pressed")).toBe("false");
    await settle(250);
    expect(vi.mocked(api.previewChange).mock.calls.at(-1)![1]).toEqual({ type: "price", amount: 7, start_month: 5 });
  });
});

describe("Try a change: the answer", () => {
  it("shows what you would keep, the catch and how sure we are", async () => {
    mount();
    await settle();
    expect(screen.getByText("+$534")).toBeTruthy();
    expect(screen.getByText("more")).toBeTruthy();
    expect(screen.getByText("That is $6,096 a month, instead of $5,562.")).toBeTruthy();
    expect(screen.getByText("About 382 fewer visits a month, because some people will come less often.")).toBeTruthy();
    expect(screen.getByText("You come out ahead in 9 of 10 possible futures.")).toBeTruthy();
    const dotsBox = document.querySelector(".try-dots")!;
    expect(dotsBox.children).toHaveLength(10);
    expect(dotsBox.querySelectorAll(".try-dot-on")).toHaveLength(9);
  });

  it("says 'just a sketch' and 'nothing is saved' on the answer", async () => {
    mount();
    await settle();
    const card = screen.getByRole("region", { name: /What this price rise would do/ });
    expect(within(card).getByText("Just a sketch")).toBeTruthy();
    expect(within(card).getByText(/Nothing is saved/)).toBeTruthy();
  });

  it("uses the headings from the brief", async () => {
    mount();
    await settle();
    for (const h of ["Each month, you would keep about", "The catch", "How sure are we?"]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
  });

  it("shows a loss as a loss", async () => {
    vi.mocked(api.previewChange).mockResolvedValue(makeSketch({ extra_profit_per_month: -120, profit_per_month_with_change: 5441, ahead_of_10: 2 }));
    mount();
    await settle();
    expect(screen.getByText("-$120")).toBeTruthy();
    expect(screen.getByText("less")).toBeTruthy();
    expect(document.querySelectorAll(".try-dot-on")).toHaveLength(2);
  });

  it("uses the business currency", async () => {
    vi.mocked(api.getBusiness).mockResolvedValue({
      id: 1, name: "noah", industry: "cafe", currency: "EUR", created_at: "x", setup_source: "full", is_sample: false, baseline: null,
    });
    mount();
    await settle();
    expect(screen.getByText(/^\+€534$/)).toBeTruthy();
  });
});

describe("Try a change: the coach note is plain rules, never AI", () => {
  it("small rise", async () => {
    mount();
    await settle();
    expect(screen.getByLabelText("A quick thought").textContent).toBe("Small rises are often noticed less than owners fear.");
  });

  it("big jump (over 10%) and tiny rise (under 4%)", async () => {
    mount();
    await settle();
    await drag(12);
    expect(screen.getByLabelText("A quick thought").textContent).toBe("That is a big jump. More of your regulars may drift away, so the gain is less certain.");
    await drag(2);
    expect(screen.getByLabelText("A quick thought").textContent).toBe("Low risk, but the gain is small too.");
  });

  it("the note changes at once, even before the numbers arrive", async () => {
    mount();
    await settle();
    fireEvent.change(slider(), { target: { value: "13" } });
    expect(screen.getByLabelText("A quick thought").textContent).toContain("big jump");
  });

  it("never calls the coach or anything AI", async () => {
    mount();
    await settle();
    await drag(11);
    expect(api.requestCoach).not.toHaveBeenCalled();
    expect(api.askCoach).not.toHaveBeenCalled();
    expect(api.getTodayNote).not.toHaveBeenCalled();
  });
});

describe("Try a change: live while dragging", () => {
  it("waits for the slider to settle, then asks once with the last value", async () => {
    mount();
    await settle();
    vi.mocked(api.previewChange).mockClear();
    for (const v of [8, 9, 10, 11]) {
      fireEvent.change(slider(), { target: { value: String(v) } });
      await settle(60);
    }
    expect(api.previewChange).not.toHaveBeenCalled();
    await settle(250);
    expect(api.previewChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.previewChange).mock.calls[0][1].amount).toBe(11);
    expect(screen.getByText("11%")).toBeTruthy();
  });

  it("keeps the last answer on screen with a small 'Updating…', and never shows a blocking spinner", async () => {
    mount();
    await settle();
    vi.mocked(api.previewChange).mockImplementation(() => new Promise(() => undefined));
    fireEvent.change(slider(), { target: { value: "12" } });
    await settle(250);
    expect(screen.getByText("+$534")).toBeTruthy();                       // the old answer is still there
    expect(screen.getByRole("status").textContent).toBe("Updating…");
    expect(document.querySelector(".spinner")).toBeNull();
    expect(screen.queryByText("Working it out…")).toBeNull();
    expect(screen.getByRole("slider")).toBeTruthy();                      // and the slider still works
  });

  it("the Watch link follows the slider and the start button", async () => {
    const { user } = mount();
    await settle();
    expect(screen.getByRole("link", { name: "Watch the next 12 months →" }).getAttribute("href")).toBe("/timeline?change=price&amount=7&start=1");
    await drag(10);
    await user.click(screen.getByRole("button", { name: "In 3 months" }));
    expect(screen.getByRole("link", { name: "Watch the next 12 months →" }).getAttribute("href")).toBe("/timeline?change=price&amount=10&start=3");
  });

  it("shows a calm message if the very first answer fails", async () => {
    vi.mocked(api.previewChange).mockRejectedValue(new Error("down"));
    mount();
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("We couldn't work that out just now");
  });

  it("if a later answer fails, keeps the old numbers and says so", async () => {
    mount();
    await settle();
    vi.mocked(api.previewChange).mockRejectedValue(new Error("down"));
    await drag(9);
    expect(screen.getByText("+$534")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("You are seeing your last try");
  });
});

describe("Try a change: saving as a scenario", () => {
  async function openSave(user: ReturnType<typeof userEvent.setup>) {
    await settle();
    await user.click(screen.getByRole("button", { name: "Save this as a scenario" }));
    return screen.getByRole("dialog", { name: "Save this as a scenario?" });
  }

  it("is disabled until the picture has settled, and enabled after", async () => {
    mount();
    expect((screen.getByRole("button", { name: "Save this as a scenario" }) as HTMLButtonElement).disabled).toBe(true);
    await settle();
    expect((screen.getByRole("button", { name: "Save this as a scenario" }) as HTMLButtonElement).disabled).toBe(false);
    vi.mocked(api.previewChange).mockImplementation(() => new Promise(() => undefined));
    fireEvent.change(slider(), { target: { value: "9" } });
    expect((screen.getByRole("button", { name: "Save this as a scenario" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks the owner to confirm the plain sentence first, and saves nothing until they do", async () => {
    const { user } = mount();
    const dialog = await openSave(user);
    expect(within(dialog).getByText("Raise prices by 7% from November 2026 (month 1).")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Yes, that's what I mean" })).toBeTruthy();
    expect(api.createScenario).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.createScenario).not.toHaveBeenCalled();
    expect(api.simulateBusiness).not.toHaveBeenCalled();
  });

  it("Esc also cancels", async () => {
    const { user } = mount();
    await openSave(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.createScenario).not.toHaveBeenCalled();
  });

  it("confirming makes a confirmed scenario, runs the full simulation, and opens the full result", async () => {
    vi.mocked(api.createScenario).mockResolvedValue({ id: 31 } as api.ScenarioOut);
    vi.mocked(api.simulateBusiness).mockResolvedValue({ id: 77 } as api.SimulationRunOut);
    const { user } = mount();
    await settle();
    await user.click(screen.getByRole("button", { name: "In 3 months" }));
    await settle(250);
    const dialog = await openSave(user);
    await user.click(within(dialog).getByRole("button", { name: "Yes, that's what I mean" }));
    await waitFor(() => expect(api.createScenario).toHaveBeenCalledTimes(1));
    const [businessId, name, decisions] = vi.mocked(api.createScenario).mock.calls[0];
    expect(businessId).toBe(1);
    expect(name).toBe("Raise prices by 7% from November 2026");
    expect(decisions).toEqual([{
      type: "price", start_month: 3, value: 7, unit: "percent", source: "user", confirmed: true, confirmedVia: "try_change",
    }]);
    expect(api.simulateBusiness).toHaveBeenCalledWith(1, [31], 24);
    expect((await screen.findByTestId("where")).textContent).toBe("/history?business=1&run=77");
  });

  it("if the name is taken it tries '(2)' instead of failing", async () => {
    vi.mocked(api.createScenario)
      .mockRejectedValueOnce(new api.ApiError(409, "a scenario with this name already exists for this business"))
      .mockResolvedValue({ id: 32 } as api.ScenarioOut);
    vi.mocked(api.simulateBusiness).mockResolvedValue({ id: 78 } as api.SimulationRunOut);
    const { user } = mount();
    const dialog = await openSave(user);
    await user.click(within(dialog).getByRole("button", { name: "Yes, that's what I mean" }));
    await waitFor(() => expect(api.createScenario).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createScenario).mock.calls[1][1]).toBe("Raise prices by 7% from November 2026 (2)");
    expect((await screen.findByTestId("where")).textContent).toBe("/history?business=1&run=78");
  });

  it("if saving fails it says so and stays here, without running anything", async () => {
    vi.mocked(api.createScenario).mockRejectedValue(new Error("Could not reach the API."));
    const { user } = mount();
    const dialog = await openSave(user);
    await user.click(within(dialog).getByRole("button", { name: "Yes, that's what I mean" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the API");
    expect(api.simulateBusiness).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Try a change: keyboard, phone and accessibility", () => {
  it("has no automatic accessibility violations", async () => {
    const { container } = mount();
    await settle();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("the slider and every button can be reached with Tab", async () => {
    const { user } = mount();
    await settle();
    const reached = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      reached.add(el.getAttribute("role") === "slider" || el.getAttribute("type") === "range" ? "slider" : (el.textContent ?? ""));
    }
    for (const want of ["slider", "Next month", "In 3 months", "In spring", "Watch the next 12 months →", "Save this as a scenario"]) {
      expect(reached.has(want), want).toBe(true);
    }
  });

  it("start buttons work with Enter and Space", async () => {
    const { user } = mount();
    await settle();
    screen.getByRole("button", { name: "In 3 months" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "In 3 months" }).getAttribute("aria-pressed")).toBe("true");
    screen.getByRole("button", { name: "In spring" }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "In spring" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("the thumb is at least 30px and the page is one column on a phone (in the stylesheet)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src", "beginner.css"), "utf-8");
    expect(css).toMatch(/\.try-slider::-webkit-slider-thumb\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.try-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("uses no browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount();
    await settle();
    await drag(10);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
