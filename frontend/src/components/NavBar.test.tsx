import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { NavBar } from "./NavBar";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, listBusinesses: vi.fn() };
});

describe("NavBar", () => {
  beforeEach(() => {
    vi.mocked(api.listBusinesses).mockResolvedValue([
      { id: 3, name: "Sunrise Bakery", industry: "bakery", currency: "USD", created_at: "", baseline: null },
    ]);
  });

  it("keeps the selected business in every page link", async () => {
    render(
      <MemoryRouter initialEntries={["/compare?business=3"]}>
        <NavBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /What-ifs/ }).getAttribute("href")).toBe("/scenarios?business=3");
    expect(screen.getByRole("link", { name: /Past results/ }).getAttribute("href")).toBe("/history?business=3");
    // "My business" starts a new business, so it doesn't carry the old one along.
    expect(screen.getByRole("link", { name: /My business/ }).getAttribute("href")).toBe("/setup");
  });

  it("shows which business you are working on", async () => {
    render(
      <MemoryRouter initialEntries={["/compare?business=3"]}>
        <NavBar />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Sunrise Bakery")).toBeTruthy();
  });

  it("marks the current page", () => {
    render(
      <MemoryRouter initialEntries={["/compare"]}>
        <NavBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Compare/ }).getAttribute("aria-current")).toBe("page");
  });
});
