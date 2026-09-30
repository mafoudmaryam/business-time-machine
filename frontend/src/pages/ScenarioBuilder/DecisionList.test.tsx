import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DecisionFormValues, Interpretation, InterpretedDecision } from "../../api";
import { stepsFromInterpretation } from "../../lib/interpretView";
import { DecisionList } from "./DecisionList";

const price: InterpretedDecision = {
  type: "price", start_month: 6, value: 10, unit: "percent", source_quote: "Raise prices 10% in March",
  sentence: "Raise prices 10%, from March 2027 (month 6)", when_label: "March 2027 (month 6)", group: null, role: null,
  group_sentence: null,
};
const hire: InterpretedDecision = {
  type: "hiring", start_month: 9, value: 1, unit: "fte", source_quote: "hire a baker for the summer",
  sentence: "Hire 1 baker, June → August 2027 (months 9–11)", when_label: "June → August 2027 (months 9–11)",
  group: "g1", role: "start", group_sentence: "Hire 1 baker, June → August 2027 (months 9–11)",
};
const back: InterpretedDecision = { ...hire, start_month: 12, value: -1, role: "end", sentence: "Back to normal from September 2027 (month 12)" };
const reading: Interpretation = {
  id: 7, business_id: 1, text: "x", status: "done", provider: null, fallback: null, decisions: [price, hire, back],
  questions: [], out_of_scope: null, notes: [], month_one: "",
};

function setup(decisions: DecisionFormValues[] = stepsFromInterpretation(reading)) {
  const handlers = { onSetConfirmed: vi.fn(), onConfirmAll: vi.fn(), onRemove: vi.fn(), onEdit: vi.fn() };
  render(<DecisionList decisions={decisions} industryId="bakery" staffNoun="baker" currency="USD" {...handlers} />);
  return handlers;
}

describe("DecisionList with steps from the owner's own words", () => {
  it("shows each step's sentence with the matched words softly underneath, all unticked", () => {
    setup();
    expect(screen.getByText("Raise prices 10%, from March 2027 (month 6)")).toBeTruthy();
    expect(screen.getByText("From your words: “Raise prices 10% in March”")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2); // the temporary hire is ONE item, so two rows in all
    expect(boxes.every((b) => !b.checked)).toBe(true);
  });

  it("shows a temporary change as one grouped step, not two", () => {
    setup();
    expect(screen.getByText("Hire 1 baker, June → August 2027 (months 9–11)")).toBeTruthy();
    expect(screen.queryByText(/Back to normal from September/)).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("ticking a grouped step confirms both of its decisions", async () => {
    const user = userEvent.setup();
    const { onSetConfirmed } = setup();
    await user.click(screen.getAllByRole("checkbox")[1]);
    expect(onSetConfirmed).toHaveBeenCalledWith([1, 2], true, "one_by_one");
  });

  it("a grouped step is only ticked when both decisions are", () => {
    const steps = stepsFromInterpretation(reading).map((s, i) => ({ ...s, confirmed: i !== 2 }));
    setup(steps);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
  });

  it("removing a grouped step removes both decisions", async () => {
    const user = userEvent.setup();
    const { onRemove } = setup();
    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(onRemove).toHaveBeenCalledWith([1, 2]);
  });

  it("each checkbox belongs to its sentence, for screen readers", () => {
    setup();
    const box = screen.getAllByRole("checkbox")[0];
    expect(box.getAttribute("aria-describedby")).toBe("step-sentence-0");
    expect(document.getElementById("step-sentence-0")?.textContent).toMatch(/Raise prices 10%/);
  });

  it("edits a step with the sentence-style form, starting from its values", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    expect(screen.getByText("Change this step")).toBeTruthy();
    const amount = screen.getByLabelText(/Price change/) as HTMLInputElement;
    expect(amount.value).toBe("10");
    await user.clear(amount);
    await user.type(amount, "12");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    const [item, edited, endMonth] = onEdit.mock.calls[0];
    expect(item).toMatchObject({ kind: "single", index: 0 });
    expect(edited).toMatchObject({ type: "price", value: 12, start_month: 6 });
    expect(endMonth).toBeNull();
    expect(screen.queryByText("Change this step")).toBeNull(); // the editor closes
  });

  it("can cancel an edit", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Raise prices 10%, from March 2027 (month 6)")).toBeTruthy();
  });

  it("editing a grouped step also lets the owner move the 'back to normal' month", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const end = screen.getByLabelText(/Back to normal in month/) as HTMLInputElement;
    expect(end.value).toBe("12");
    await user.clear(end);
    await user.type(end, "11");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const [item, , endMonth] = onEdit.mock.calls[0];
    expect(item).toMatchObject({ kind: "pair", index: 1, endIndex: 2 });
    expect(endMonth).toBe(11);
  });

  it("an empty 'back to normal' month means the change keeps going", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.clear(screen.getByLabelText(/Back to normal in month/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onEdit.mock.calls[0][2]).toBeNull();
  });

  it("an edited step is worded by the form and says the owner changed it", () => {
    const steps = stepsFromInterpretation(reading).map((s, i) => (i === 0 ? { ...s, value: 12, edited: true } : s));
    setup(steps);
    expect(screen.getByText("Raise prices 12% from month 6")).toBeTruthy();
    expect(screen.getByText("You changed this step.")).toBeTruthy();
  });

  it("steps added by hand look as before: no quote, no AI styling", () => {
    const hand: DecisionFormValues = { type: "price", start_month: 2, value: 5, unit: "percent", source: "user", confirmed: false };
    setup([hand]);
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Raise prices 5% from month 2")).toBeTruthy();
    expect(within(row).queryByText(/From your words/)).toBeNull();
    expect(row.className).not.toMatch(/decision-row-ai/);
  });

  it("shows the empty hint when there are no steps", () => {
    setup([]);
    expect(screen.getByText("No decisions added yet.")).toBeTruthy();
  });

  describe("the Confirm all bar", () => {
    it("counts steps and confirmed steps, with a temporary change counting as ONE step", () => {
      setup();
      expect(screen.getByRole("status").textContent).toBe("2 steps · 0 confirmed");
    });

    it("counts a step as confirmed only when every decision of it is", () => {
      const steps = stepsFromInterpretation(reading).map((x, i) => ({ ...x, confirmed: i !== 2 }));
      setup(steps);
      expect(screen.getByRole("status").textContent).toBe("2 steps · 1 confirmed");
    });

    it("keeps every step's sentence visible right under the bar, and Confirm all changes nothing by itself", async () => {
      const user = userEvent.setup();
      const { onConfirmAll } = setup();
      const bar = document.querySelector(".confirm-bar") as HTMLElement;
      const list = document.querySelector(".decision-list") as HTMLElement;
      expect(bar.nextElementSibling).toBe(list);
      await user.click(screen.getByRole("button", { name: "Confirm all" }));
      expect(onConfirmAll).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Raise prices 10%, from March 2027 (month 6)")).toBeTruthy();
      expect(screen.getByText("Hire 1 baker, June → August 2027 (months 9–11)")).toBeTruthy();
    });

    it("turns into a disabled 'All confirmed' with a check when everything is confirmed", () => {
      setup(stepsFromInterpretation(reading).map((x) => ({ ...x, confirmed: true })));
      const done = screen.getByRole("button", { name: "All confirmed" }) as HTMLButtonElement;
      expect(done.disabled).toBe(true);
      expect(done.querySelector("svg")).not.toBeNull();
      expect(screen.getByRole("status").textContent).toBe("2 steps · 2 confirmed");
      expect(screen.queryByRole("button", { name: "Confirm all" })).toBeNull();
    });

    it("says '1 step' for one step", () => {
      setup([stepsFromInterpretation(reading)[0]]);
      expect(screen.getByRole("status").textContent).toBe("1 step · 0 confirmed");
    });

    it("works from the keyboard: Tab to the button and press Enter", async () => {
      const user = userEvent.setup();
      const { onConfirmAll } = setup();
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm all" }));
      await user.keyboard("{Enter}");
      expect(onConfirmAll).toHaveBeenCalledTimes(1);
    });

    it("is not shown when there are no steps", () => {
      setup([]);
      expect(document.querySelector(".confirm-bar")).toBeNull();
    });
  });
});
