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

  it("Try a change opens the scenario builder for the remembered business", () => {
    rememberBusiness(4);
    nav();
    expect(screen.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/scenarios?business=4");
  });

  it("without a remembered business it still goes to the builder", () => {
    nav();
    expect(screen.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/scenarios");
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
