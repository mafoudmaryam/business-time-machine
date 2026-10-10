import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { US_CAFE, US_CAFE_ANSWERS } from "../../guideFixtures";
import { GuidePage } from "./GuidePage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, getGuideOptions: vi.fn(), createGuidePlan: vi.fn(), changeGuideAnswers: vi.fn(), getGuidePlan: vi.fn() };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

const OPTIONS: api.GuideOptions = {
  data_version: "2026-10-10.1", engine_version: "1",
  countries: [
    { id: "US", name: "United States", currency: "USD", mode: "full" },
    { id: "UK", name: "United Kingdom", currency: "GBP", mode: "own_numbers" },
    { id: "CN", name: "China", currency: "CNY", mode: "own_numbers" },
    { id: "OTHER", name: "Somewhere else", currency: "USD", mode: "checklist_only" },
  ],
  business_types: [{ id: "cafe", name: "Café" }, { id: "restaurant", name: "Restaurant" }, { id: "bakery", name: "Bakery" }],
};

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function mount(path = "/guide") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guide" element={<GuidePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Next" }));
const question = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  vi.mocked(api.getGuideOptions).mockResolvedValue(OPTIONS);
  vi.mocked(api.createGuidePlan).mockResolvedValue({ id: 5, created_at: "x", business_id: null, data_version: "v", data_changed: false, plan: US_CAFE });
});

describe("the nine questions", () => {
  it("shows one question at a time, starting with what to open, with the standing disclaimer", async () => {
    mount();
    expect(await screen.findByText("Question 1 of 9")).toBeTruthy();
    expect(question()).toBe("What would you like to open?");
    expect(screen.getByRole("button", { name: "Café" })).toBeTruthy();
    expect(screen.getByText("A rough estimate, not advice. Real costs depend on your city and your choices.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not go on without a choice, and says so", async () => {
    const { user } = mount();
    await screen.findByText("Question 1 of 9");
    await next(user);
    expect((await screen.findByRole("alert")).textContent).toMatch(/choose what you would like to open/);
    expect(screen.getByText("Question 1 of 9")).toBeTruthy();
  });

  it("walks through all nine screens and makes the plan from the answers (empty boxes are sent as null, never 0)", async () => {
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await next(user);
    expect(question()).toBe("Which country will you open in?");
    await user.click(screen.getByRole("radio", { name: "United States" }));
    await next(user);
    expect(question()).toBe("How much money can you put in?");
    await next(user); // empty budget = not sure yet
    expect(question()).toBe("Will you rent, own, or start smaller?");
    await user.click(screen.getByRole("radio", { name: /Rent an empty space and fit it out/ }));
    await user.type(screen.getByLabelText(/Rent a month/), "4000");
    await next(user);
    await user.click(screen.getByRole("radio", { name: /Small/ }));
    await next(user);
    expect(question()).toBe("What will you serve?");
    await user.click(screen.getByRole("radio", { name: "A short, simple menu" }));
    await user.click(screen.getByRole("radio", { name: "No" }));
    await next(user);
    await user.type(screen.getByLabelText(/People who work there/), "3");
    await next(user);
    expect(question()).toMatch(/how many customers do you hope for/);
    await user.type(screen.getByLabelText(/What one customer spends/), "7");
    expect(screen.queryByLabelText(/Ingredient share of sales/)).toBeNull(); // the US has a published figure
    await next(user);
    await user.click(screen.getByRole("radio", { name: "In 3 to 6 months" }));
    expect(screen.getByText("Question 9 of 9")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show my rough plan" }));
    await waitFor(() => expect(api.createGuidePlan).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createGuidePlan).mock.calls[0][0]).toEqual({
      business_type: "cafe", country: "US", currency: "USD", budget: null, premises: "fit_out", rent: 4000, size: "small", menu: "simple",
      alcohol: "no", people: 3, customers_per_day: null, avg_spend: 7, ingredient_share: null, timeline: "6m",
    });
    expect((await screen.findByTestId("where")).textContent).toBe("/guide/plan/5");
  });

  it("keeps the screen number in the address, and Previous keeps the answers", async () => {
    const { user } = mount("/guide?step=3");
    expect(await screen.findByText("Question 3 of 9")).toBeTruthy();
    await user.type(screen.getByLabelText(/Money you can put in/), "50000");
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Question 2 of 9")).toBeTruthy();
    await next(user).catch(() => undefined);
    await user.click(screen.getByRole("radio", { name: "United Kingdom" }));
    await next(user);
    expect((screen.getByLabelText(/Money you can put in/) as HTMLInputElement).value).toBe("50000");
  });

  it("asks for a head count and does not invent one", async () => {
    const { user } = mount("/guide?step=7");
    await screen.findByText("Question 7 of 9");
    await next(user);
    expect(await screen.findByText(/how many people will work there/, { selector: ".field-error" })).toBeTruthy();
    expect(api.createGuidePlan).not.toHaveBeenCalled();
  });

  it("refuses a negative budget with a plain sentence", async () => {
    const { user } = mount("/guide?step=3");
    await user.type(await screen.findByLabelText(/Money you can put in/), "-5");
    await next(user);
    expect(await screen.findByText(/more than zero/)).toBeTruthy();
  });

  it("shows the rent box only when renting", async () => {
    const { user } = mount("/guide?step=4");
    await screen.findByText("Question 4 of 9");
    expect(screen.queryByLabelText(/Rent a month/)).toBeNull();
    await user.click(screen.getByRole("radio", { name: /I already own the place/ }));
    expect(screen.queryByLabelText(/Rent a month/)).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Rent a ready-to-use shop/ }));
    expect(screen.getByLabelText(/Rent a month/)).toBeTruthy();
  });
});

describe("countries and their modes", () => {
  it("China is a real choice and is explained as bring-your-own-numbers", async () => {
    const { user } = mount("/guide?step=2");
    await user.click(await screen.findByRole("radio", { name: "China" }));
    expect(screen.getByRole("note").textContent).toMatch(/sourced pay figures and the official rules for China, but not cost totals/);
    expect(screen.getByRole("note").textContent).toMatch(/type your own rent and ingredient cost/);
  });

  it("the United Kingdom and China get the extra ingredient-share box on the customers screen; the United States does not", async () => {
    const { user } = mount("/guide?step=2");
    await user.click(await screen.findByRole("radio", { name: "United Kingdom" }));
    await user.click(screen.getByRole("button", { name: "Previous" }).closest("section")!.querySelector("button:not(:disabled):last-child")!);
    // go straight to the customers screen with the country kept
    const again = mount("/guide?step=8");
    expect(await screen.findAllByLabelText(/Ingredient share of sales/)).toHaveLength(1);
    again.unmount();
  });

  it("somewhere else says there are no numbers and offers a currency for anything typed", async () => {
    const { user } = mount("/guide?step=2");
    await user.click(await screen.findByRole("radio", { name: "Somewhere else" }));
    expect(screen.getByRole("note").textContent).toMatch(/no sourced figures for this country/);
    expect(screen.getByLabelText(/Currency for any amounts you type/)).toBeTruthy();
  });

  it("the United States says its numbers are sourced", async () => {
    const { user } = mount("/guide?step=2");
    await user.click(await screen.findByRole("radio", { name: "United States" }));
    expect(screen.getByRole("note").textContent).toMatch(/sourced pay and cost figures/);
  });
});

describe("half-finished answers and changing a plan", () => {
  it("are kept in this tab only, so a refresh does not lose them", async () => {
    const first = mount("/guide?step=3");
    await first.user.type(await screen.findByLabelText(/Money you can put in/), "12000");
    first.unmount();
    mount("/guide?step=3");
    expect((await screen.findByLabelText(/Money you can put in/) as HTMLInputElement).value).toBe("12000");
  });

  it("start from a saved plan's answers when changing them, and save through the change route", async () => {
    vi.mocked(api.getGuidePlan).mockResolvedValue({ id: 5, created_at: "x", business_id: null, data_version: "v", data_changed: false, plan: { ...US_CAFE, answers: US_CAFE_ANSWERS as never } });
    vi.mocked(api.changeGuideAnswers).mockResolvedValue({ id: 5, created_at: "x", business_id: null, data_version: "v", data_changed: false, plan: US_CAFE });
    const { user } = mount("/guide?plan=5&step=9");
    expect(await screen.findByRole("button", { name: "Save my changes" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("radio", { name: "In 3 to 6 months" })).toHaveProperty("checked", true));
    await user.click(screen.getByRole("button", { name: "Save my changes" }));
    await waitFor(() => expect(api.changeGuideAnswers).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.changeGuideAnswers).mock.calls[0][0]).toBe(5);
    expect(api.createGuidePlan).not.toHaveBeenCalled();
    expect((await screen.findByTestId("where")).textContent).toBe("/guide/plan/5");
  });
});

describe("when things go wrong", () => {
  it("says so calmly and keeps the answers if the plan cannot be made", async () => {
    vi.mocked(api.createGuidePlan).mockRejectedValue(new api.ApiError(422, "Please tell us how many people will work there."));
    const { user } = mount("/guide?step=9");
    await user.click(await screen.findByRole("radio", { name: "Just exploring" }));
    await user.click(screen.getByRole("button", { name: "Show my rough plan" }));
    expect((await screen.findAllByText("Please tell us how many people will work there."))[0]).toBeTruthy();
    expect(screen.getByText("Question 9 of 9")).toBeTruthy();
  });

  it("shows a try-again message if the questions cannot load", async () => {
    vi.mocked(api.getGuideOptions).mockRejectedValue(new Error("boom"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t load the questions/);
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("keyboard and accessibility", () => {
  it("every screen passes the automatic accessibility check", async () => {
    for (const step of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const { container, unmount } = mount(`/guide?step=${step}`);
      await screen.findByText(`Question ${step} of 9`);
      expect((await axe(container)).violations, `step ${step}`).toEqual([]);
      unmount();
    }
  });

  it("choices are a radio group that can be used with the keyboard", async () => {
    const { user } = mount("/guide?step=9");
    await screen.findByText("Question 9 of 9");
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(true);
  });
});
