import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { rememberBusiness } from "../../lib/session";
import { ExplorePage } from "./ExplorePage";

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{location.pathname + location.search}</p>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/explore"]}>
      <Routes>
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { window.sessionStorage.clear(); rememberBusiness(7); });

describe("Explore a change", () => {
  it.each([
    ["Prices", "/try"],
    ["Staffing", "/scenarios?business=7&type=hiring"],
    ["Opening days", "/scenarios?business=7&type=hours"],
    ["Marketing", "/scenarios?business=7&type=marketing"],
  ])("opens the existing tool for %s with the selected business", async (name, destination) => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("link", { name }));
    expect(await screen.findByTestId("destination")).toHaveProperty("textContent", destination);
  });

  it("returns to setup when no business has been chosen", async () => {
    window.sessionStorage.clear();
    mount();
    expect(await screen.findByTestId("destination")).toHaveProperty("textContent", "/");
  });

  it("has accessible keyboard choices and keeps the marketing limit visible", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    expect((await axe(container)).violations).toEqual([]);
    for (const name of ["Prices", "Staffing", "Opening days", "Marketing"]) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("link", { name }));
    }
    expect(screen.getByText(/Marketing response is a rough estimate/).closest("details")).toBeNull();
    expect(screen.getByText(/more or fewer days each month/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Combine changes/ }).getAttribute("href")).toBe("/scenarios?business=7");
  });
});
