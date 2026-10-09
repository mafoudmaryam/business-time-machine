import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { rememberBusiness } from "../lib/session";
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
    expect(within(main).getByRole("link", { name: "Today" }).getAttribute("href")).toBe("/today");
    expect(within(main).getByRole("link", { name: "Try a change" })).toBeTruthy();
    expect(within(main).getByText("Advanced")).toBeTruthy();
  });

  it("keeps the old pages reachable under Advanced, at their old addresses", () => {
    nav();
    const hrefs = Object.fromEntries(
      ["Compare", "Run history", "Full business setup"].map((name) => [name, screen.getByRole("link", { name, hidden: true }).getAttribute("href")]),
    );
    expect(hrefs).toEqual({ Compare: "/compare", "Run history": "/history", "Full business setup": "/setup" });
  });

  it("Try a change opens the Try page, with or without a business open (the page itself sends you to the start screen if none)", () => {
    rememberBusiness(4);
    nav();
    expect(screen.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
  });

  it("the old scenario builder is under Advanced", () => {
    nav();
    expect(screen.getByRole("link", { name: "Scenario builder", hidden: true }).getAttribute("href")).toBe("/scenarios");
  });

  it("Try a change is marked as current on the Try page and on the 12-month page", () => {
    for (const path of ["/try", "/timeline"]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <AppNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "Try a change" }).className).toContain("active");
      expect(screen.getByRole("link", { name: "Today" }).className).not.toContain("active");
      unmount();
    }
  });

  it("marks the current page", () => {
    nav("/today");
    expect(screen.getByRole("link", { name: "Today" }).className).toContain("active");
    expect(screen.getByRole("link", { name: "Try a change" }).className).not.toContain("active");
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
    expect(within(main).getByRole("link", { name: "What you get" }).getAttribute("href")).toBe("#what-you-get");
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
    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
  });
});
