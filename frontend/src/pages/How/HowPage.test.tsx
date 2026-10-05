import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { rememberBusiness } from "../../lib/session";
import { makeHow } from "../../test-fixtures";
import { HowPage } from "./HowPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, getHow: vi.fn(), requestCoach: vi.fn(), askCoach: vi.fn(), getTodayNote: vi.fn() };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

function mount() {
  return render(
    <MemoryRouter initialEntries={["/how"]}>
      <Routes>
        <Route path="/how" element={<HowPage />} />
        <Route path="*" element={<p>Somewhere else</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const section = (name: string) => within(screen.getByRole("region", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  rememberBusiness(1);
  vi.mocked(api.getHow).mockResolvedValue(makeHow());
});

describe("How we worked it out", () => {
  it("has four plain sections in order", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "How we worked it out" })).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["What you told us", "What we assumed", "How the answer is made", "What we do not know"]);
  });

  it("shows the owner's own numbers, and only those, under 'What you told us'", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    const told = section("What you told us");
    expect(told.getByText("Customers on a normal day").nextSibling?.textContent).toBe("150");
    expect(told.getByText("Average spend per customer").nextSibling?.textContent).toBe("$7");
    expect(told.getByText("Monthly rent").nextSibling?.textContent).toBe("$3,000");
    expect(told.getByText("People who work there").nextSibling?.textContent).toBe("4");
    expect(told.queryByText(/Cash in the bank/)).toBeNull();      // that one is assumed
  });

  it("shows the assumed numbers separately, each marked 'Assumed' with its rule and a 'Change this' link", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    const assumed = section("What we assumed");
    const items = assumed.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Cash in the bank:")).toBeTruthy();
    expect(within(items[0]).getByText("$51,400")).toBeTruthy();
    expect(within(items[0]).getByText("Assumed")).toBeTruthy();
    expect(within(items[0]).getByText("two months of your monthly costs")).toBeTruthy();
    for (const li of items) expect(within(li).getByRole("link", { name: /^Change / }).getAttribute("href")).toBe("/today#assumed");
    expect(assumed.getByRole("link", { name: "Change Cash in the bank" })).toBeTruthy();
    // the two lists never show the same number
    expect(assumed.queryByText("Monthly rent")).toBeNull();
    expect(assumed.queryByText("Customers on a normal day")).toBeNull();
  });

  it("explains how the answer is made in 3-4 plain sentences, using the stored run's numbers", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    const made = section("How the answer is made");
    expect(made.getAllByText(/./, { selector: "p" })).toHaveLength(4);
    expect(made.getByText(/1,000 possible futures/)).toBeTruthy();
    expect(made.getByText(/most likely path/)).toBeTruthy();
    expect(made.getByText(/program version 0\.1\.0/)).toBeTruthy();
    expect(made.queryByText(/equation|formula|Monte Carlo/i)).toBeNull();
  });

  it("is honest about what we do not know", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    const limits = section("What we do not know").getAllByRole("listitem").map((li) => li.textContent ?? "");
    const all = limits.join(" ");
    expect(all).toMatch(/marketing/);
    expect(all).toMatch(/has not been checked against real data/);
    expect(all).toMatch(/seasons/);
    expect(all).toMatch(/not a forecast/);
    expect(all).toMatch(/not financial advice/);
  });

  it("never mentions the AI as the author of anything but says it did not write the page", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/Nothing on this page is written by an AI/)).toBeTruthy();
    expect(api.requestCoach).not.toHaveBeenCalled();
    expect(api.askCoach).not.toHaveBeenCalled();
    expect(api.getTodayNote).not.toHaveBeenCalled();
  });

  it("links on to the share page and back to Today", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("link", { name: "Print or share a summary" }).getAttribute("href")).toBe("/share");
    expect(screen.getByRole("link", { name: "Back to Today" }).getAttribute("href")).toBe("/today");
  });
});

describe("How we worked it out: other kinds of business", () => {
  it("a business where the owner typed everything: nothing is assumed", async () => {
    vi.mocked(api.getHow).mockResolvedValue(makeHow({
      setup_source: "full", assumed: [],
      told: [{ key: "cash", label: "Cash in the bank", value: 25000, unit: "money" }, { key: "churn_rate", label: "Regulars who stop coming each month", value: 0.05, unit: "percent" }],
    }));
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(section("What we assumed").getByText("Nothing. Every number is one you entered yourself.")).toBeTruthy();
    expect(section("What you told us").getByText("5%")).toBeTruthy();
  });

  it("a sample business: says nothing is the owner's own yet, offers to start with their own numbers, and everything is assumed", async () => {
    vi.mocked(api.getHow).mockResolvedValue(makeHow({ is_sample: true, setup_source: "sample", told: [] }));
    mount();
    await screen.findByRole("heading", { level: 1 });
    const told = section("What you told us");
    expect(told.getByText(/This is a sample business, so you haven't entered numbers of your own yet/)).toBeTruthy();
    expect(told.getByRole("link", { name: "Start with my own numbers" }).getAttribute("href")).toBe("/");
    expect(section("What we assumed").getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("when we filled in everything but the owner has not told us anything", async () => {
    vi.mocked(api.getHow).mockResolvedValue(makeHow({ told: [] }));
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(section("What you told us").getByText(/Nothing yet: every number was filled in by us/)).toBeTruthy();
  });

  it("in another currency it warns that the typical money amounts are US dollars and formats in that currency", async () => {
    vi.mocked(api.getHow).mockResolvedValue(makeHow({ currency: "EUR" }));
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/are US dollars\. Please change them to your own amounts in EUR/)).toBeTruthy();
    expect(section("What we assumed").getByText("€51,400")).toBeTruthy();
  });
});

describe("How we worked it out: states and accessibility", () => {
  it("goes to the start screen when no business is chosen", async () => {
    window.sessionStorage.clear();
    mount();
    expect(await screen.findByText("Somewhere else")).toBeTruthy();
    expect(api.getHow).not.toHaveBeenCalled();
  });

  it("shows a calm waiting line while loading", () => {
    vi.mocked(api.getHow).mockReturnValue(new Promise(() => undefined));
    mount();
    expect(screen.getByRole("status").textContent).toContain("Gathering the details");
  });

  it("shows a friendly message with Try again if it fails, never a raw error", async () => {
    vi.mocked(api.getHow).mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error")).mockResolvedValue(makeHow());
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load this page");
    expect(alert.textContent).not.toContain("Internal Server Error");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(await screen.findByRole("heading", { level: 1, name: "How we worked it out" })).toBeTruthy();
  });

  it("when the program is not running, says what to do", async () => {
    vi.mocked(api.getHow).mockRejectedValue(new api.ApiError(0, "Could not reach the API. Is the backend running on http://localhost:8000?"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("We can't reach the program that does the sums");
  });

  it("has no automatic accessibility violations", async () => {
    const { container } = mount();
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container)).violations).toEqual([]);
  });

  it("every 'Change this' link can be reached with the keyboard", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    for (const link of screen.getAllByRole("link", { name: /^Change / })) {
      link.focus();
      expect(document.activeElement).toBe(link);
    }
  });
});
