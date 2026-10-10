import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { UndoProvider } from "../../components/UndoProvider";
import { CN_COMPLETE, OTHER, UK_NEEDS, US_BAKERY, US_CAFE, US_RESTAURANT } from "../../guideFixtures";
import { formatMoney } from "../../lib/format";
import { getRememberedBusinessId } from "../../lib/session";
import { PlanPage } from "./PlanPage";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, getGuidePlan: vi.fn(), getGuideSimulator: vi.fn(), createGuideBusiness: vi.fn(), linkGuideBusiness: vi.fn(),
    recalculateGuidePlan: vi.fn(), deleteGuidePlan: vi.fn(), restoreGuidePlan: vi.fn(),
    requestCoach: vi.fn(), askCoach: vi.fn(), previewChange: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));

const out = (plan: api.GuidePlan, over: Partial<api.GuidePlanOut> = {}): api.GuidePlanOut => ({
  id: 7, created_at: "2026-10-10T10:00:00", business_id: null, data_version: plan.data_version, data_changed: false, plan, ...over,
});

const READY: api.GuideSimulatorOut = {
  ready: true, missing: [], notes: ["You were not sure how many customers to expect, so the practice business uses the number you would need to break even."],
  quick: { baseline: { customers: 1 } as never, assumed: [], warnings: [], preview: {} as never },
};

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function mount(path = "/guide/plan/7") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <Routes>
          <Route path="/guide/plan/:id" element={<PlanPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

async function show(plan: api.GuidePlan, over: Partial<api.GuidePlanOut> = {}) {
  vi.mocked(api.getGuidePlan).mockResolvedValue(out(plan, over));
  const view = mount();
  await screen.findByRole("heading", { level: 1, name: "Your rough start-up plan" });
  return view;
}

const section = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(api.getGuideSimulator).mockResolvedValue(READY);
});

describe("trust labels (on every plan)", () => {
  it("says it is a rough estimate and not advice, and that the picture assumes a smooth business", async () => {
    await show(US_CAFE);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your rough start-up plan");
    expect(screen.getByText("A small café in the United States")).toBeTruthy();
    expect(screen.getAllByText(/A rough estimate, not advice\. Real costs depend on your city and your choices\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText("This is a starting picture. It assumes your business is open and running smoothly.").length).toBeGreaterThan(0);
    expect(screen.getByText("Scenarios, not forecasts. Not legal, tax or financial advice.")).toBeTruthy();
    expect(screen.getByText(/Saved on this computer only/)).toBeTruthy();
  });

  it("has a Back-friendly page inside the app layout: no coach, no AI, nothing asked of an AI provider", async () => {
    await show(US_CAFE);
    expect(api.requestCoach).not.toHaveBeenCalled();
    expect(api.askCoach).not.toHaveBeenCalled();
    expect(screen.queryByText(/Your coach says/)).toBeNull();
  });
});

describe("the United States plan (full mode)", () => {
  it("does not headline one big start-up range: the summary has no start-up number", async () => {
    await show(US_CAFE);
    const summary = section("The short version");
    expect(summary.textContent).not.toContain(formatMoney(US_CAFE.startup.low!, "USD"));
    expect(summary.textContent).not.toContain(formatMoney(US_CAFE.startup.high!, "USD"));
    expect(summary.textContent).toMatch(/shown line by line below/);
    expect(within(summary).getByText("Running costs a month")).toBeTruthy();
    expect(within(summary).getByText("Customers a day to break even")).toBeTruthy();
    expect(within(summary).getByText("Looks tight")).toBeTruthy();
  });

  it("shows the start-up cost as labelled lines, each with its range and source, then a wide total with the plain explanation", async () => {
    await show(US_CAFE);
    const s = section("What it might cost to start");
    expect(within(s).getByText(/Published guides say\. These lines come from published guides written by companies that sell to shops, restaurants and new businesses\./)).toBeTruthy();
    const table = within(s).getByRole("table", { name: "Start-up cost lines" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(US_CAFE.startup.lines.length + 1);
    expect(within(table).getByText("Build-out and renovations")).toBeTruthy();
    expect(within(table).getByText("$30,000 to $150,000")).toBeTruthy();
    expect(within(table).getAllByRole("link", { name: /KORONA POS/ })[0].getAttribute("href")).toBe("https://koronapos.com/blog/how-much-does-it-cost-to-open-a-coffee-shop/");
    expect(within(s).getByText("All the lines added up")).toBeTruthy();
    expect(within(s).getByText("$63,500 to $250,000")).toBeTruthy();
    expect(within(s).getByText(/This range is wide because published guides disagree, and costs depend a lot on your city and choices\./)).toBeTruthy();
    expect(within(s).getByText(/from one published guide/)).toBeTruthy();
    expect(within(s).getByText(/the guide.s own total/i)).toBeTruthy();
  });

  it("names what kind of source each vendor line is and says it sells to restaurants", async () => {
    await show(US_CAFE);
    const s = section("What it might cost to start");
    expect(within(s).getAllByText(/from a company that sells to shops, restaurants and new businesses; read 10 October 2026/).length).toBeGreaterThan(5);
  });

  it("for a bakery, shows both the sum of the lines and the guide's own total", async () => {
    await show(US_BAKERY);
    const s = section("What it might cost to start");
    expect(within(s).getByText(US_BAKERY.startup.low!.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) + " to " + US_BAKERY.startup.high!.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }))).toBeTruthy();
    expect(s.textContent).toMatch(/gives its own total \(the guide.s own total for a bakery with a shop\) as \$62,500 to \$77,500/);
    expect(within(s).getAllByText("one figure from one guide").length).toBeGreaterThan(3);
  });

  it("shows running costs, the break-even steps with the cushion's source, and the budget with named assumptions", async () => {
    await show(US_CAFE);
    const running = section("Running costs and break-even");
    expect(within(running).getByRole("table", { name: "Running costs a month" })).toBeTruthy();
    expect(within(running).getByText("Ingredients")).toBeTruthy();
    expect(running.textContent).toMatch(/published median of 32\.4% of sales/);
    expect(running.textContent).toMatch(/People cost about 33\.7% of your sales; published figures for comparison: 30% to 34\.1% of sales/);
    expect(within(running).getByRole("heading", { name: "Break-even" })).toBeTruthy();
    expect(within(running).getByRole("link", { name: /US Small Business Administration/ })).toBeTruthy();
    const budget = section("A starting budget with a cushion");
    expect(budget.textContent).toMatch(/Contingency for surprises \(10% to 20%, our assumption\)/);
    expect(budget.textContent).toMatch(/Cash buffer \(3 to 6 months of running costs, our assumption\)/);
    expect(budget.textContent).toMatch(/not a prediction/);
    expect(budget.textContent).toMatch(/Your budget looks tight/);
  });

  it("lists every fact with its source link and date read, and every assumption with its reason", async () => {
    await show(US_CAFE);
    const how = section("How we worked it out");
    const facts = within(how).getByRole("table", { name: "Facts used, with sources and dates" });
    expect(within(facts).getAllByRole("row")).toHaveLength(US_CAFE.facts_used.length + 1);
    for (const f of US_CAFE.facts_used) expect(within(facts).getAllByRole("link", { name: f.source!.name }).length).toBeGreaterThan(0);
    expect(facts.textContent).toMatch(/10 October 2026/);
    for (const a of US_CAFE.assumptions) expect(how.textContent).toContain(a.rationale);
    expect(how.textContent).toMatch(/Which published figures stand in for your business/);
    expect(how.textContent).toMatch(/We are not affiliated with these sites, receive nothing from them, and do not endorse them\./);
    expect(how.textContent).toMatch(/Links may change; last checked/);
    expect(how.textContent).toMatch(/No AI wrote any number/);
  });

  it("every outside link opens safely in a new tab", async () => {
    await show(US_CAFE);
    const links = screen.getAllByRole("link").filter((a) => (a.getAttribute("href") ?? "").startsWith("http"));
    expect(links.length).toBeGreaterThan(10);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("rel")).toContain("noreferrer");
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("every amount of money on the page is a number the engine sent", async () => {
    const { container } = await show(US_CAFE);
    const sent = new Set<string>();
    const walk = (node: unknown) => {
      if (typeof node === "number") {
        sent.add(formatMoney(node, "USD"));
        sent.add(new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(node));
      } else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(US_CAFE);
    // read each piece of text on its own, so neighbouring boxes are not glued together ("$7,925" + "3 months")
    const pieces: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) pieces.push(n.textContent ?? "");
    const shown = pieces.join(" ").match(/\$[\d,]+(\.\d\d)?/g) ?? [];
    expect(shown.length).toBeGreaterThan(30);
    for (const amount of shown) expect(sent.has(amount), `${amount} is not from the engine`).toBe(true);
  });
});

describe("the checklist, where to find it, and what we cannot do", () => {
  it("has the nine first-year items, with the urgent ones first for someone opening soon", async () => {
    await show(US_CAFE);
    const cards = section("Your first-year checklist").querySelectorAll("details > summary");
    expect([...cards].map((c) => c.textContent?.replace("Start here", ""))).toEqual([
      "Find your premises", "Licences, permits and registration", "Equipment", "Suppliers", "Menu and pricing", "Staff", "Marketing",
      "Bookkeeping and tax", "Insurance",
    ]);
    expect(within(cards[0] as HTMLElement).getByText("Start here")).toBeTruthy();
  });

  it("names only official pages we read, never a supplier", async () => {
    await show(US_CAFE);
    const lic = screen.getByText("Licences, permits and registration").closest("details") as HTMLElement;
    expect(within(lic).getByRole("link", { name: /Launch your business: Apply for licenses and permits/ }).getAttribute("href")).toBe("https://www.sba.gov/counseling/launch-your-business/");
    expect(within(lic).getAllByRole("link", { name: /Food and Drug Administration/ }).length).toBeGreaterThan(0);
    const eq = screen.getByText("Equipment").closest("details") as HTMLElement;
    expect(within(eq).getByText(/new restaurant-equipment dealers/)).toBeTruthy();
    expect(within(eq).queryAllByRole("link").filter((a) => !/KORONA|ZenBusiness/.test(a.textContent ?? ""))).toHaveLength(0);
  });

  it("says plainly what we cannot do, with a visit link where an official page exists", async () => {
    await show(US_CAFE);
    const lic = screen.getByText("Licences, permits and registration").closest("details") as HTMLElement;
    expect(within(lic).getByRole("note").textContent).toMatch(/We can.t tell you which licences you need or what they cost/);
    expect(within(lic).getByRole("note").textContent).toMatch(/Visit:/);
    const eq = screen.getByText("Equipment").closest("details") as HTMLElement;
    expect(within(eq).getByRole("note").textContent).toMatch(/We can.t recommend or price equipment suppliers/);
    for (const d of section("Your first-year checklist").querySelectorAll("details")) expect(within(d as HTMLElement).getByRole("note")).toBeTruthy();
  });

  it("shows what you will probably struggle with, using published numbers only for the US", async () => {
    await show(US_CAFE);
    const s = section("What you will probably struggle with");
    for (const t of ["Cash running short", "Rent that is too heavy", "Food waste", "Staffing costs and turnover", "Prices that are too low or too high", "Slow months"]) {
      expect(within(s).getByRole("heading", { name: t })).toBeTruthy();
    }
    expect(s.textContent).toMatch(/30 to 34\.1 percent for limited-service places/);
  });
});

describe("a US restaurant (no start-up total)", () => {
  it("says there is no start-up total and to ask locally, instead of a number", async () => {
    await show(US_RESTAURANT);
    const s = section("What it might cost to start");
    expect(s.textContent).toMatch(/No start-up total for your case/);
    expect(s.textContent).toMatch(/Ask two or three local suppliers and agents for quotes/);
    expect(within(s).queryByRole("table")).toBeNull();
    expect(section("A starting budget with a cushion").textContent).toMatch(/can.t compare your budget with a full plan/);
  });
});

describe("the United Kingdom and China (bring your own numbers)", () => {
  it("UK: says what we still need from the person and never guesses it", async () => {
    await show(UK_NEEDS);
    const r = section("Running costs and break-even");
    expect(r.textContent).toMatch(/We need a few numbers from you/);
    expect(within(r).getByText("your monthly rent")).toBeTruthy();
    expect(within(r).getByText("your ingredient share of sales")).toBeTruthy();
    expect(section("What it might cost to start").textContent).toMatch(/No start-up total/);
    const lic = screen.getByText("Licences, permits and registration").closest("details") as HTMLElement;
    expect(within(lic).getByRole("note").textContent).toMatch(/free, and the official page says to do it at least 28 days before you start trading/);
    expect(within(lic).getByRole("link", { name: /Starting a food business/ }).getAttribute("href")).toBe("https://www.gov.uk/guidance/starting-a-food-business");
  });

  it("UK: struggles carry no US numbers", async () => {
    await show(UK_NEEDS);
    expect(section("What you will probably struggle with").textContent).not.toMatch(/34\.1|74\.4/);
  });

  it("China: a complete own-numbers plan with pay as a range in yuan and the official licensing pointer", async () => {
    await show(CN_COMPLETE);
    expect(screen.getByText("A small café in China")).toBeTruthy();
    const r = section("Running costs and break-even");
    expect(within(r).getByRole("table", { name: "Running costs a month" }).textContent).toMatch(/CN¥|¥/);
    expect(r.textContent).toMatch(/your own estimate of 35% of sales/);
    expect(section("What it might cost to start").textContent).toMatch(/No start-up total/);
    const lic = screen.getByText("Licences, permits and registration").closest("details") as HTMLElement;
    expect(within(lic).getByRole("note").textContent).toContain("食品经营许可");
    expect(within(lic).getByRole("note").textContent).toContain("food business licence (食品经营许可)");
    expect(within(lic).getByRole("note").textContent).toContain("Administration for Market Regulation office (市场监督管理局)");
    expect(within(lic).getAllByRole("link", { name: /State Administration for Market Regulation/ }).length).toBeGreaterThan(0);
    const how = section("How we worked it out");
    expect(how.textContent).toMatch(/National Bureau of Statistics of China/);
  });
});

describe("somewhere else (checklist only)", () => {
  it("shows the checklist and no cost numbers at all", async () => {
    const { container } = await show(OTHER);
    expect(section("What it might cost to start").textContent).toMatch(/No start-up total/);
    expect(section("Running costs and break-even").textContent).toMatch(/no sourced figures for your country/);
    expect(section("Your first-year checklist").querySelectorAll("details")).toHaveLength(9);
    expect((container.textContent ?? "").match(/[$£¥€]\s?\d/g)).toBeNull();
    expect(screen.queryByText("Looks enough")).toBeNull();
  });
});

describe("Try it in the simulator", () => {
  it("uses the existing start flow, then links the business back and opens Today", async () => {
    vi.mocked(api.createGuideBusiness).mockResolvedValue({ id: 41, name: "My future café (plan)" } as api.BusinessOut);
    vi.mocked(api.linkGuideBusiness).mockResolvedValue(out(US_CAFE, { business_id: 41 }));
    const { user } = await show(US_CAFE);
    const button = await screen.findByRole("button", { name: "Try it in the simulator" });
    expect(section("Try it in the simulator").textContent).toMatch(/as if it were already open and trading normally/);
    await user.click(button);
    await waitFor(() => expect(api.createGuideBusiness).toHaveBeenCalledWith("My future café (plan)", "cafe", "USD", READY.quick));
    expect(api.linkGuideBusiness).toHaveBeenCalledWith(7, 41);
    expect(getRememberedBusinessId()).toBe(41);
    expect((await screen.findByTestId("where")).textContent).toBe("/today");
  });

  it("says which numbers are missing and never invents them", async () => {
    vi.mocked(api.getGuideSimulator).mockResolvedValue({ ready: false, missing: ["avg_spend"], notes: [], quick: null });
    await show(UK_NEEDS);
    const t = section("Try it in the simulator");
    expect(await within(t).findByText(/A few numbers are missing/)).toBeTruthy();
    expect(t.textContent).toMatch(/what one customer spends/);
    expect(within(t).queryByRole("button", { name: "Try it in the simulator" })).toBeNull();
    expect(within(t).getByRole("link", { name: "Add them" }).getAttribute("href")).toBe("/guide?plan=7&step=8");
  });

  it("offers to open the practice business that already exists", async () => {
    const { user } = await show(US_CAFE, { business_id: 41 });
    await user.click(await screen.findByRole("button", { name: "Open your practice business" }));
    expect(getRememberedBusinessId()).toBe(41);
    expect((await screen.findByTestId("where")).textContent).toBe("/today");
    expect(api.createGuideBusiness).not.toHaveBeenCalled();
  });

  it("stays on the page with a plain message if setting up fails", async () => {
    vi.mocked(api.createGuideBusiness).mockRejectedValue(new Error("boom"));
    const { user } = await show(US_CAFE);
    await user.click(await screen.findByRole("button", { name: "Try it in the simulator" }));
    expect((await screen.findByText("boom"))).toBeTruthy();
    expect(getRememberedBusinessId()).toBeNull();
  });
});

describe("save, change answers, delete with Undo", () => {
  it("links to changing the answers", async () => {
    await show(US_CAFE);
    expect(screen.getByRole("link", { name: "Change my answers" }).getAttribute("href")).toBe("/guide?plan=7");
  });

  it("deletes after a plain confirmation, then offers Undo, which restores it", async () => {
    vi.mocked(api.deleteGuidePlan).mockResolvedValue({ id: 7, kind: "plan", name: "x", deleted_at: "x" });
    vi.mocked(api.restoreGuidePlan).mockResolvedValue(out(US_CAFE));
    const { user } = await show(US_CAFE);
    await user.click(screen.getByRole("button", { name: "Delete this plan" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/This removes the plan and the answers you gave for it/);
    expect(dialog.textContent).toMatch(/A practice business you already made from it is not deleted/);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteGuidePlan).toHaveBeenCalledWith(7));
    expect((await screen.findByTestId("where")).textContent).toBe("/guide");
    await user.click(await screen.findByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(api.restoreGuidePlan).toHaveBeenCalledWith(7));
    expect(await screen.findByRole("heading", { level: 1, name: "Your rough start-up plan" })).toBeTruthy();
  });

  it("can be printed from the page", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { user } = await show(US_CAFE);
    await user.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(print).toHaveBeenCalled();
  });

  it("tells the person when the data behind the plan has been updated, and remembers they saw it", async () => {
    vi.mocked(api.recalculateGuidePlan).mockResolvedValue(out(US_CAFE, { data_changed: false }));
    const { user } = await show(US_CAFE, { data_changed: true });
    expect(screen.getByText(/has been updated since you last looked/).closest("[role=status]")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByText(/has been updated since you last looked/)).toBeNull());
    expect(api.recalculateGuidePlan).toHaveBeenCalledWith(7);
  });
});

describe("empty and error states", () => {
  it("a plan that does not exist is a friendly empty state with one next step", async () => {
    vi.mocked(api.getGuidePlan).mockRejectedValue(new api.ApiError(404, "plan not found"));
    mount();
    expect(await screen.findByRole("heading", { name: "We couldn’t find that plan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Make a new plan" }).getAttribute("href")).toBe("/guide");
  });

  it("a failed load is a calm message with Try again, never a status code", async () => {
    vi.mocked(api.getGuidePlan).mockRejectedValue(new api.ApiError(500, "internal error 500"));
    const { user } = mount();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t load your plan/);
    expect(alert.textContent).not.toMatch(/500|internal/);
    vi.mocked(api.getGuidePlan).mockResolvedValue(out(US_CAFE));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your rough start-up plan" })).toBeTruthy();
  });
});

describe("accessibility and printing", () => {
  it("passes the automatic accessibility check in every mode", async () => {
    for (const plan of [US_CAFE, US_BAKERY, US_RESTAURANT, UK_NEEDS, CN_COMPLETE, OTHER]) {
      vi.mocked(api.getGuidePlan).mockResolvedValue(out(plan));
      const { container, unmount } = mount();
      await screen.findByRole("heading", { level: 1, name: "Your rough start-up plan" });
      expect((await axe(container)).violations, plan.country.name + plan.business_type).toEqual([]);
      unmount();
    }
  }, 60000);

  it("opens every checklist card when printing and closes them afterwards", async () => {
    const { container } = await show(US_CAFE);
    const cards = () => [...container.querySelectorAll<HTMLDetailsElement>(".guide-check")];
    cards().forEach((d) => (d.open = false));
    window.dispatchEvent(new Event("beforeprint"));
    expect(cards().every((d) => d.open)).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect(cards().every((d) => !d.open)).toBe(true);
  });
});
