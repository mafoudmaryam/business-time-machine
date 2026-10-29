import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { getRememberedBusinessId, rememberBusiness } from "../lib/session";
import { AppNav } from "./AppNav";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, listBusinesses: vi.fn() };
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(api.listBusinesses).mockResolvedValue([]);
});

function nav(path = "/today") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav />
    </MemoryRouter>,
  );
}

describe("AppNav", () => {
  it("shows Today, Try a change and Advanced", () => {
    nav();
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/today");
    expect(within(main).getByRole("link", { name: "Try an idea" })).toBeTruthy();
    expect(within(main).getByText("Advanced")).toBeTruthy();
  });

  it("keeps the old pages reachable under Advanced, at their old addresses", () => {
    nav();
    const hrefs = Object.fromEntries(
      ["Compare plans", "Saved plans and results", "Detailed business setup"].map((name) => [name, screen.getByRole("link", { name, hidden: true }).getAttribute("href")]),
    );
    expect(hrefs).toEqual({ "Compare plans": "/compare", "Saved plans and results": "/history", "Detailed business setup": "/setup" });
  });

  it("Try a change opens the choice page, with or without a business open (the page itself sends you to the start screen if none)", () => {
    rememberBusiness(4);
    nav();
    expect(screen.getByRole("link", { name: "Try an idea" }).getAttribute("href")).toBe("/explore");
  });

  it("the old scenario builder is under Advanced", () => {
    nav();
    expect(screen.getByRole("link", { name: "Detailed plan builder", hidden: true }).getAttribute("href")).toBe("/scenarios");
  });

  it("Try a change is marked as current on the Try page and on the 12-month page", () => {
    for (const path of ["/explore", "/try", "/timeline"]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <AppNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "Try an idea" }).className).toContain("active");
      expect(screen.getByRole("link", { name: "Overview" }).className).not.toContain("active");
      unmount();
    }
  });

  it("marks the current page", () => {
    nav("/today");
    expect(screen.getByRole("link", { name: "Overview" }).className).toContain("active");
    expect(screen.getByRole("link", { name: "Try an idea" }).className).not.toContain("active");
  });

  it("the title always takes you to the start screen, whatever is open", async () => {
    rememberBusiness(4);
    const user = userEvent.setup();
    nav("/compare");
    expect(screen.getByRole("link", { name: "Business Time Machine" }).getAttribute("href")).toBe("/");
    await user.click(screen.getByText("Advanced"));
  });

  it("has the business menu in the header", async () => {
    nav();
    expect(await screen.findByRole("button", { name: /Choose a business/ })).toBeTruthy();
  });
});

describe("AppNav on the start screen", () => {
  it("offers the sections of the welcome page and a round Get started button", () => {
    nav("/");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("#how-it-works");
    expect(within(main).queryByRole("link", { name: "What you get" })).toBeNull();
    expect(within(main).getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("#start-here");
    expect(within(main).getByRole("link", { name: "Business Time Machine" }).getAttribute("href")).toBe("/");
  });

  it("has no Log in link, because the app has no login", () => {
    nav("/");
    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
  });

  it("scrolls in place and does not add a history entry (that would reset the form)", async () => {
    nav("/");
    document.body.insertAdjacentHTML("beforeend", '<section id="start-here"></section>');
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Get started" }));
    expect(scrolled).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("keeps the app's own links on every other page", () => {
    nav("/today");
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
  });
});


describe("task navigation and keyboard access", () => {
  it.each(["/explore", "/try", "/timeline", "/scenarios", "/compare", "/history"])("keeps Try an idea current on %s", path => {
    nav(path);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Try an idea" }).getAttribute("aria-current")).toBe(path === "/explore" ? "page" : "location");
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(within(main).getByRole("link", { name: "Tools" }).getAttribute("href")).toBe("/tools");
  });
  it("keeps assumptions and reports within Overview", () => {
    nav("/share");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("location");
  });
  it("opens Advanced with the keyboard and Escape closes it with focus restored", async () => {
    nav();
    const user = userEvent.setup();
    const summary = screen.getByText("Advanced");
    summary.focus();
    // jsdom does not implement the browser’s native Enter-to-toggle for summary.
    await user.click(summary);
    expect(summary.parentElement?.hasAttribute("open")).toBe(true);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Detailed plan builder" }));
    await user.keyboard("{Escape}");
    expect(summary.parentElement?.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
  it("carries a URL-selected business into saved plans and remembers it when leaving", async () => {
    rememberBusiness(4);
    nav("/compare?business=9");
    const user = userEvent.setup();
    await user.click(screen.getByText("Advanced"));
    expect(screen.getByRole("link", { name: "Saved plans and results" }).getAttribute("href")).toBe("/history?business=9");
    await user.click(screen.getByRole("link", { name: "Track results" }));
    expect(getRememberedBusinessId()).toBe(9);
    expect(screen.getByRole("link", { name: "Track results" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Advanced").parentElement?.hasAttribute("open")).toBe(false);
  });
});

  it("adds the Tools category, not a separate calculator feature link", () => {
    nav("/tools");
    expect(screen.getByRole("link", { name: "Tools" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "How much do I need to sell?" })).toBeNull();
  });
