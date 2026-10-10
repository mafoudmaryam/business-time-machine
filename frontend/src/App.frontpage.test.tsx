import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { App } from "./App";
import { UndoProvider } from "./components/UndoProvider";
import { getRememberedBusinessId, rememberBusiness } from "./lib/session";
import { makeToday } from "./test-fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, listIndustries: vi.fn(), listBusinesses: vi.fn(), getToday: vi.fn(), getTodayNote: vi.fn() };
});
vi.mock("./lib/events", () => ({ track: vi.fn() }));
vi.mock("./pages/Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));

const biz = (id: number, name: string): api.BusinessOut => ({
  id, name, industry: "cafe", currency: "USD", created_at: "2026-10-03", setup_source: "full", is_sample: false, baseline: null,
});
const NOAH = biz(5, "noah");
const OTHERS = [biz(1, "Demo Cafe"), biz(3, "Sunrise Bakery Test")];

const CAFE: api.IndustryOut = {
  id: "cafe", display_name: "Café", customer_noun: "regulars", staff_noun: "barista", capacity_label: "x", field_labels: {},
  default_baseline: {
    customers: 900, cash: 25000, staff_fte: 5, avg_ticket: 6.5, visits_per_regular: 6, walk_in_visits: 2500, cogs_ratio: 0.3,
    wage_per_fte: 3000, fixed_costs: 15000, marketing: 400, churn_rate: 0.05, seats: 35, open_days: 28,
  },
};

const FRONT_PAGE = "What kind of business do you run?";

function open(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <App />
      </UndoProvider>
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  rememberBusiness(5); // noah is open
  vi.mocked(api.listIndustries).mockResolvedValue([CAFE]);
  vi.mocked(api.listBusinesses).mockResolvedValue([...OTHERS, NOAH]);
  vi.mocked(api.getToday).mockImplementation((id) =>
    Promise.resolve(makeToday({ business_id: id, name: id === 5 ? "noah" : "other" })),
  );
});

describe("the front page is always reachable, even with a business open", () => {
  it("/ shows the start screen and never redirects to Today", async () => {
    open("/");
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Today at/ })).toBeNull();
    expect(api.getToday).not.toHaveBeenCalled();
    expect(getRememberedBusinessId()).toBe(5); // looking at it changes nothing
  });

  it("/start shows it too", async () => {
    open("/start");
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });

  it("clicking the header title on Today goes to the start screen", async () => {
    const user = open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    await user.click(screen.getByRole("link", { name: "Business Time Machine" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Today at/ })).toBeNull();
    expect(getRememberedBusinessId()).toBe(5);
  });

  it("clicking the title again, from the start screen itself, starts the form over", async () => {
    const user = open("/");
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Tell us about your café" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Business Time Machine" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Tell us about your café" })).toBeNull();
  });
});

describe("the start screen with a business open", () => {
  it("has no 'Continue with' bar for the open business, and nothing extra in the page body", async () => {
    open("/");
    await screen.findByRole("button", { name: "Café" });
    expect(screen.queryByRole("button", { name: "Continue with noah" })).toBeNull();
    expect(screen.queryByText(/noah is open/)).toBeNull();
    expect(document.querySelector(".continue-current")).toBeNull();
  });

  it("shows 'Today' in the top bar, next to the page sections, and it goes to that business", async () => {
    const user = open("/");
    const nav = within(await screen.findByRole("navigation", { name: "Main" }));
    const labels = nav.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(expect.arrayContaining(["How it works", "What you get", "Today"]));
    await user.click(nav.getByRole("link", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "Today at noah" })).toBeTruthy();
    expect(api.getToday).toHaveBeenCalledWith(5);
  });

  it("shows no 'Today' link in the top bar when no business is open", async () => {
    window.sessionStorage.clear();
    open("/");
    const nav = within(await screen.findByRole("navigation", { name: "Main" }));
    expect(nav.queryByRole("link", { name: "Today" })).toBeNull();
    expect(nav.getByRole("link", { name: "How it works" })).toBeTruthy();
  });

  it("lists the OTHER saved businesses below, and opens one only when picked", async () => {
    const user = open("/");
    const list = within(await screen.findByRole("region", { name: "My businesses" }));
    expect(list.getByRole("button", { name: "Continue with Demo Cafe" })).toBeTruthy();
    expect(list.getByRole("button", { name: "Continue with Sunrise Bakery Test" })).toBeTruthy();
    expect(list.queryByRole("button", { name: "Continue with noah" })).toBeNull(); // noah is reached from Today in the top bar
    expect(api.getToday).not.toHaveBeenCalled();
    await user.click(list.getByRole("button", { name: "Continue with Demo Cafe" }));
    expect(await screen.findByRole("heading", { name: "Today at other" })).toBeTruthy();
    expect(getRememberedBusinessId()).toBe(1);
  });

  it("with only the open business saved there is no second list", async () => {
    vi.mocked(api.listBusinesses).mockResolvedValue([NOAH]);
    open("/");
    await screen.findByRole("button", { name: "Café" });
    expect(screen.queryByRole("region", { name: "My businesses" })).toBeNull();
  });

  it("without an open business there is no bar, only the list", async () => {
    window.sessionStorage.clear();
    open("/");
    await screen.findByRole("region", { name: "My businesses" });
    expect(document.querySelector(".continue-current")).toBeNull();
  });

  it("a business that was deleted is not offered as the open one", async () => {
    vi.mocked(api.listBusinesses).mockResolvedValue(OTHERS); // noah is gone from the server
    open("/");
    await screen.findByRole("region", { name: "My businesses" });
    expect(screen.queryByRole("button", { name: "Continue with noah" })).toBeNull();
  });
});

describe("'New business' in the header menu", () => {
  it("from Today reaches the start screen with the form", async () => {
    const user = open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    await user.click(screen.getByRole("button", { name: /noah/ }));
    await user.click(screen.getByRole("button", { name: "New business" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Café" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(getRememberedBusinessId()).toBe(5); // nothing is deleted or changed
  });

  it("from the middle of the form, starts a fresh form instead of doing nothing", async () => {
    const user = open("/");
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText(/Customers on a normal day/), "150");
    await user.click(screen.getByRole("button", { name: /noah/ }));
    await user.click(screen.getByRole("button", { name: "New business" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.queryByLabelText(/Customers on a normal day/)).toBeNull();
  });
});

describe("the Back button in the real app", () => {
  it("from Today, Back returns to the start screen you came from", async () => {
    const user = open("/");
    await user.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("link", { name: "Today" }));
    await screen.findByRole("heading", { name: "Today at noah" });
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull(); // none on the start screen
    expect(getRememberedBusinessId()).toBe(5); // going back changes nothing
  });

  it("with no earlier page (Today opened directly), Back goes to the start screen", async () => {
    const user = open("/today");
    await screen.findByRole("heading", { name: "Today at noah" });
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
  });

  it("the start screen has no Back button, but the form inside it keeps its own Back", async () => {
    const user = open("/");
    await user.click(await screen.findByRole("button", { name: "Café" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" })); // the form's own step Back
    expect(await screen.findByRole("heading", { name: FRONT_PAGE })).toBeTruthy();
  });
});
