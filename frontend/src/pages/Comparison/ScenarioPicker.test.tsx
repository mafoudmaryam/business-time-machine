import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { DecisionOut, ScenarioOut } from "../../api";
import { ScenarioPicker } from "./ScenarioPicker";

function decision(over: Partial<DecisionOut> = {}): DecisionOut {
  return { id: 1, type: "price", start_month: 3, value: 10, unit: "percent", extra: {}, source: "user", confirmed: true, ...over };
}

function scenario(id: number, name: string, decisions: DecisionOut[] = [decision()]): ScenarioOut {
  return { id, business_id: 1, name, parent_scenario_id: null, parent_scenario_name: null, created_at: "2026-01-01", decisions };
}

/** Holds the chosen ids like the Compare page does, and lets a test decide what "Looks right" does. */
function Harness({ scenarios, onConfirm, start = [] }: { scenarios: ScenarioOut[]; onConfirm?: (id: number) => Promise<void>; start?: number[] }) {
  const [ids, setIds] = useState<number[]>(start);
  const [list, setList] = useState(scenarios);
  return (
    <MemoryRouter>
      <ScenarioPicker
        scenarios={list}
        businessId={1}
        staffNoun="barista"
        currency="USD"
        selectedIds={ids}
        onToggle={(id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : x.length < 3 ? [...x, id] : x))}
        onConfirm={async (id) => {
          await onConfirm?.(id);
          setList((l) => l.map((s) => (s.id === id ? { ...s, decisions: s.decisions.map((d) => ({ ...d, confirmed: true })) } : s)));
          setIds((x) => (x.includes(id) || x.length >= 3 ? x : [...x, id]));
        }}
      />
    </MemoryRouter>
  );
}

const unconfirmed = scenario(2, "Hire a barista", [decision({ id: 5, type: "hiring", start_month: 6, value: 1, unit: "fte", confirmed: false })]);

describe("ScenarioPicker", () => {
  it("shows the fixed 'If you change nothing' card: always included, not clickable, no long text", () => {
    render(<Harness scenarios={[scenario(1, "Price +10%")]} />);
    const base = screen.getByText("If you change nothing").closest("li") as HTMLElement;
    expect(within(base).getByText("Always included")).toBeTruthy();
    expect(within(base).queryByRole("checkbox")).toBeNull();
    expect(within(base).queryByRole("button")).toBeNull();
    expect(base.textContent).toBe("If you change nothingAlways included");
  });

  it("has a short heading with a live counter and no long sentence", async () => {
    const user = userEvent.setup();
    render(<Harness scenarios={[scenario(1, "Price +10%")]} />);
    expect(screen.getByRole("heading", { name: /Pick up to 3/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 of 3 chosen");
    await user.click(screen.getByRole("checkbox", { name: /Price \+10%/ }));
    expect(screen.getByRole("status").textContent).toBe("1 of 3 chosen");
    expect(screen.queryByText(/always included\)/)).toBeNull();
  });

  it("each card has a name, a one-line plain summary and a tick box", () => {
    render(<Harness scenarios={[scenario(1, "Price +10%")]} />);
    expect(screen.getByText("Raise prices 10% from month 3")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Price \+10%/ })).toBeTruthy();
  });

  it("an unconfirmed scenario has a Check & add button instead of a tick box: no red text, no disabled box, no builder link", () => {
    const { container } = render(<Harness scenarios={[unconfirmed]} />);
    expect(screen.getByRole("button", { name: "Check & add" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/needs confirmation/i)).toBeNull();
    expect(container.querySelector(".needs-confirmation")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Hire 1 barista from month 6")).toBeTruthy();
  });

  it("Check & add opens a small panel listing the decisions in plain words, with Looks right and Edit", async () => {
    const user = userEvent.setup();
    render(<Harness scenarios={[unconfirmed]} />);
    const open = screen.getByRole("button", { name: "Check & add" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    await user.click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");

    const panel = screen.getByRole("group", { name: "Check Hire a barista" });
    expect(within(panel).getByText("This scenario will:")).toBeTruthy();
    expect(within(panel).getByText("Hire 1 barista from month 6")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Looks right" })).toBeTruthy();
    const edit = within(panel).getByRole("link", { name: "Edit" });
    expect(edit.getAttribute("href")).toBe("/scenarios?business=1&duplicate=2");
  });

  it("Looks right confirms through the API, ticks the card and never asks twice", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness scenarios={[unconfirmed]} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Check & add" }));
    await user.click(screen.getByRole("button", { name: "Looks right" }));

    expect(onConfirm).toHaveBeenCalledWith(2);
    const box = (await screen.findByRole("checkbox", { name: /Hire a barista/ })) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Check & add" })).toBeNull();
    expect(screen.queryByRole("group", { name: /Check/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("1 of 3 chosen");
  });

  it("a failed confirmation keeps the panel open with a friendly message and nothing ticked", async () => {
    const user = userEvent.setup();
    render(<Harness scenarios={[unconfirmed]} onConfirm={vi.fn().mockRejectedValue(new Error("boom 500"))} />);
    await user.click(screen.getByRole("button", { name: "Check & add" }));
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    expect((await screen.findByRole("alert")).textContent).not.toMatch(/boom|500/);
    expect(screen.getByRole("button", { name: "Looks right" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 of 3 chosen");
  });

  it("scenarios that were already confirmed (from Try it or the describe box) are never asked about again", () => {
    render(<Harness scenarios={[scenario(1, "Reviewed one"), scenario(3, "Reviewed two")]} />);
    expect(screen.queryByRole("button", { name: "Check & add" })).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows only the newest version of each scenario, with a toggle for older ones", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        scenarios={[
          scenario(1, "Price rise"),
          scenario(2, "Price rise v2"),
          scenario(3, "Price rise v3"),
          scenario(4, "Hire a barista"),
        ]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /Price rise v3/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Hire a barista/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /^Price rise$/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Price rise v2/ })).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show older versions (2)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(screen.getByRole("checkbox", { name: /Price rise v2/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /^Price rise$/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide older versions" }));
    expect(screen.queryByRole("checkbox", { name: /Price rise v2/ })).toBeNull();
  });

  it("has no toggle when there is only one version of everything", () => {
    render(<Harness scenarios={[scenario(1, "A"), scenario(2, "B")]} />);
    expect(screen.queryByText(/older versions/)).toBeNull();
  });

  it("lets at most 3 be chosen: the other boxes are disabled and say why", async () => {
    const user = userEvent.setup();
    const all = [1, 2, 3, 4].map((i) => scenario(i, `Plan ${String.fromCharCode(64 + i)}`));
    render(<Harness scenarios={all} />);
    for (const name of ["Plan A", "Plan B", "Plan C"]) await user.click(screen.getByRole("checkbox", { name }));

    const fourth = screen.getByRole("checkbox", { name: "Plan D" }) as HTMLInputElement;
    expect(fourth.disabled).toBe(true);
    expect((fourth.closest("label") as HTMLElement).getAttribute("title")).toBe("You can compare up to 3 at a time");
    expect(document.getElementById(fourth.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "You can compare up to 3 at a time",
    );
    // the chosen ones stay clickable so one can be swapped out
    expect((screen.getByRole("checkbox", { name: "Plan A" }) as HTMLInputElement).disabled).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Plan A" }));
    expect((screen.getByRole("checkbox", { name: "Plan D" }) as HTMLInputElement).disabled).toBe(false);
  });

  it("works from the keyboard: tab to a box and press space; tab to Check & add and press enter", async () => {
    const user = userEvent.setup();
    render(<Harness scenarios={[scenario(1, "Price +10%"), unconfirmed]} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: /Price \+10%/ }));
    await user.keyboard(" ");
    expect(screen.getByRole("status").textContent).toBe("1 of 3 chosen");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Check & add" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("group", { name: /Check Hire a barista/ })).toBeTruthy();
  });
});
