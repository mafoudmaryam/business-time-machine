import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { AppLayout } from "./AppLayout";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, listBusinesses: vi.fn() };
});

/** A stand-in page: shows where we are, links to other pages, and two buttons that act like the browser's own Back and Forward. */
function Page({ title }: { title: string }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return (
    <div>
      <h1>{title}</h1>
      <p data-testid="where">{pathname + search}</p>
      <Link to="/today">to today</Link> <Link to="/compare">to compare</Link> <Link to="/history">to history</Link>
      <button onClick={() => navigate(-1)}>browser back</button>
      <button onClick={() => navigate(1)}>browser forward</button>
    </div>
  );
}

function mount(entries: string[] = ["/"], index?: number) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={entries} initialIndex={index ?? entries.length - 1}>
      <AppLayout>
        <Routes>
          {["/", "/start", "/today", "/compare", "/history", "/setup", "/scenarios", "/watch/1"].map((p) => (
            <Route key={p} path={p} element={<Page title={`Page ${p}`} />} />
          ))}
          <Route path="*" element={<Page title="Elsewhere" />} />
        </Routes>
      </AppLayout>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const where = () => screen.getByTestId("where").textContent;
const backButton = () => screen.queryByRole("button", { name: "Go back" });
const press = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(api.listBusinesses).mockResolvedValue([]);
});

describe("where the Back button shows", () => {
  it("not on the start screen, at / or /start", () => {
    mount(["/"]);
    expect(backButton()).toBeNull();
  });

  it("not on /start", () => {
    mount(["/start"]);
    expect(backButton()).toBeNull();
  });

  it("on every other page, so a new page gets it for free", () => {
    for (const path of ["/today", "/compare", "/history", "/setup", "/scenarios?business=1", "/watch/1", "/somewhere/new"]) {
      const { unmount } = mount([path]);
      expect(backButton(), path).toBeTruthy();
      unmount();
    }
  });

  it("sits under the top bar and above the page title", () => {
    mount(["/compare"]);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const back = backButton()!;
    const title = screen.getByRole("heading", { level: 1 });
    expect(nav.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.closest("main")).toBeTruthy();
  });

  it("has the label 'Go back', a visible 'Back' and an arrow icon that screen readers skip", () => {
    mount(["/compare"]);
    const back = backButton()!;
    expect(back.getAttribute("aria-label")).toBe("Go back");
    expect(back.textContent).toContain("Back");
    expect(back.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("going back to the page you were just on", () => {
  it("steps back through the pages you opened, in order", async () => {
    const { user } = mount(["/"]);
    await user.click(screen.getByRole("link", { name: "to today" }));
    await user.click(screen.getByRole("link", { name: "to compare" }));
    expect(where()).toBe("/compare");
    await user.click(backButton()!);
    expect(where()).toBe("/today");
    await user.click(backButton()!);
    expect(where()).toBe("/");
    expect(backButton()).toBeNull(); // back on the start screen
  });

  it("does not add pages to the history, so the browser's own Back keeps working", async () => {
    const { user } = mount(["/"]);
    await user.click(screen.getByRole("link", { name: "to today" }));
    await user.click(screen.getByRole("link", { name: "to compare" }));
    await user.click(backButton()!); // -> /today
    await press(user, "browser back"); // the browser's Back from /today must reach "/", not bounce to /compare
    expect(where()).toBe("/");
  });

  it("the browser's own Back and Forward keep the button right", async () => {
    const { user } = mount(["/"]);
    await user.click(screen.getByRole("link", { name: "to today" }));
    await user.click(screen.getByRole("link", { name: "to compare" }));
    await press(user, "browser back"); // /today, one page behind it
    expect(where()).toBe("/today");
    await press(user, "browser back"); // "/", the start screen
    expect(where()).toBe("/");
    expect(backButton()).toBeNull();
    await press(user, "browser forward");
    await press(user, "browser forward"); // /compare again, two pages behind it
    expect(where()).toBe("/compare");
    await user.click(backButton()!);
    expect(where()).toBe("/today");
    await user.click(backButton()!);
    expect(where()).toBe("/");
  });

  it("goes back to the page before, wherever that was", async () => {
    const { user } = mount(["/"]);
    await user.click(screen.getByRole("link", { name: "to history" }));
    await user.click(screen.getByRole("link", { name: "to compare" }));
    await user.click(backButton()!);
    expect(where()).toBe("/history");
  });
});

describe("when there is no earlier page inside the app", () => {
  const cases: [string, string][] = [
    ["/today", "/"],
    ["/compare", "/today"],
    ["/history", "/today"],
    ["/setup", "/today"],
    ["/scenarios?business=1", "/today"],
    ["/watch/1", "/today"],
    ["/nowhere/at/all", "/today"],
  ];

  for (const [from, to] of cases) {
    it(`${from} -> ${to}`, async () => {
      const { user } = mount([from]);
      await user.click(backButton()!);
      expect(where()).toBe(to);
    });
  }

  it("a refreshed deep page uses the parent, not whatever the browser kept before it", async () => {
    const { user } = mount(["/setup", "/history"], 1); // the browser remembers /setup, but this page was just loaded
    await user.click(backButton()!);
    expect(where()).toBe("/today");
  });

  it("does not trap you: Back, Back again reaches the start screen, and nothing bounces", async () => {
    const { user } = mount(["/compare"]);
    await user.click(backButton()!);
    expect(where()).toBe("/today");
    await user.click(backButton()!);
    expect(where()).toBe("/");
    expect(backButton()).toBeNull();
  });

  it("the parent replaces the page you left, so the browser's Back does not return to it either", async () => {
    const { user } = mount(["/compare"]);
    await user.click(backButton()!);
    expect(where()).toBe("/today");
    // one entry only: there is nothing for the browser to go back to inside the app
    await user.click(backButton()!);
    expect(where()).toBe("/");
  });
});

describe("keyboard and accessibility", () => {
  it("Tab reaches the button, after the top bar and before the page", async () => {
    const { user } = mount(["/compare"]);
    let reached = -1;
    for (let i = 0; i < 15 && reached < 0; i++) {
      await user.tab();
      if (document.activeElement === backButton()) reached = i;
    }
    expect(reached).toBeGreaterThanOrEqual(0);
    await user.tab(); // the next stop is inside the page, not back in the top bar
    expect(screen.getByRole("main").contains(document.activeElement)).toBe(true);
  });

  it("Enter and Space press it", async () => {
    const { user } = mount(["/compare"]);
    backButton()!.focus();
    await user.keyboard("{Enter}");
    expect(where()).toBe("/today");
    backButton()!.focus();
    await user.keyboard(" ");
    expect(where()).toBe("/");
  });

  it("has a visible focus style rule and a target at least 44px high", () => {
    const css = readFileSync(resolve(process.cwd(), "src", "beginner.css"), "utf-8");
    expect(css).toMatch(/\.back-button\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline/);
  });

  it("has no automatic accessibility violations", async () => {
    const { container } = mount(["/compare"]);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("is also fine on the start screen, where it is absent", async () => {
    const { container } = mount(["/"]);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("what it does not do", () => {
  it("uses no browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { user } = mount(["/"]);
    await user.click(screen.getByRole("link", { name: "to today" }));
    await user.click(backButton()!);
    await user.click(screen.getByRole("link", { name: "to compare" }));
    await user.click(backButton()!);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    setItem.mockRestore();
  });

  it("does not hide the page's own content", () => {
    mount(["/compare"]);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
