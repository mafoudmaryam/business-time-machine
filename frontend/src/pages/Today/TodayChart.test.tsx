import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeToday } from "../../test-fixtures";
import { TodayChart } from "./TodayChart";

// Recharts needs a real layout to draw; here we only care about the words and numbers around it.
vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box, ComposedChart: Box, Area: () => null, Line: () => null, CartesianGrid: () => null,
    XAxis: () => null, YAxis: () => null, Tooltip: () => null,
  };
});

describe("TodayChart", () => {
  it("starts on what you keep, and describes the chart in words", () => {
    render(<TodayChart today={makeToday()} />);
    expect(screen.getByRole("heading", { name: "The next 12 months, if you change nothing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What you keep" }).getAttribute("aria-pressed")).toBe("true");
    const picture = screen.getByRole("img");
    expect(picture.getAttribute("aria-label")).toContain("Most likely $5,800 in Nov 2026");
    expect(picture.getAttribute("aria-label")).toContain("Oct 2027");
  });

  it("switches to cash in the bank", async () => {
    const user = userEvent.setup();
    render(<TodayChart today={makeToday()} />);
    await user.click(screen.getByRole("button", { name: "Cash in the bank" }));
    expect(screen.getByRole("button", { name: "Cash in the bank" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Cash in the bank, month by month");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("$57,000 in Nov 2026");
  });

  it("offers the numbers as a table for anyone who cannot see the chart", async () => {
    const user = userEvent.setup();
    render(<TodayChart today={makeToday()} />);
    await user.click(screen.getByText("Show the numbers"));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(13); // header + 12 months
    const first = within(table).getByRole("row", { name: /Nov 2026/ });
    expect(first.textContent).toContain("$4,400");
    expect(first.textContent).toContain("$5,800");
    expect(first.textContent).toContain("$7,200");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Month", "Bad case", "Most likely", "Good case"]);
  });

  it("uses the business's currency", () => {
    render(<TodayChart today={makeToday({ currency: "EUR" })} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("€5,800");
  });
});
