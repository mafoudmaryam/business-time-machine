import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { makeRun, makeSketch } from "../test-fixtures";
import { explainSketch } from "../lib/resultExplanation";
import { ResultExplanation, SavedResultExplanation } from "./ResultExplanation";

describe("shared explanation", () => {
  it("shows essentials before optional details with keyboard-operable native disclosures", async () => {
    const { container } = render(<ResultExplanation explanation={explainSketch(makeSketch(), "USD")} numbers={<p>Detailed figures</p>} />);
    expect(screen.getByText("What changes")).toBeTruthy();
    const details = container.querySelectorAll("details");
    expect([...details].every(d => !d.open)).toBe(true);
    fireEvent.click(screen.getByText("See the numbers"));
    expect(details[0].open).toBe(true);
    expect(screen.getByText(/Higher profit alone/)).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });
  it("explains one selected plan without automatically preferring the higher-profit option", () => {
    const run = makeRun(); const other = structuredClone(run.results[1]);
    other.scenario_name = "Different choice"; other.summary.total_profit_p50 = 50000;
    run.results.push(other);
    render(<SavedResultExplanation run={run} currency="USD" />);
    expect(screen.getAllByText("What changes")).toHaveLength(1);
    expect(screen.getByText(/15,800.00 more/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Explain a plan"), { target: { value: "Different choice" } });
    expect(screen.getByText(/17,000.00 less/)).toBeTruthy();
    expect(screen.queryByText(/15,800.00 more/)).toBeNull();
  });

});
