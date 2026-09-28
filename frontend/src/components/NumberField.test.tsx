import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumberField } from "./NumberField";

/** Wraps NumberField the way a real form does: value lives in the parent,
 * onChange writes it back -- so these tests exercise the same round-trip a
 * user actually experiences, not just the component in isolation. */
function ControlledField(props: { initial: number; min?: number; max?: number }) {
  const [value, setValue] = useState(props.initial);
  return <NumberField label="Amount" help="help text" unit="units" value={value} onChange={setValue} />;
}

describe("NumberField", () => {
  it("can be cleared to empty instead of snapping back to 0", async () => {
    const user = userEvent.setup();
    render(<ControlledField initial={35} />);
    const input = screen.getByLabelText(/Amount/) as HTMLInputElement;

    await user.clear(input);

    expect(input.value).toBe("");
  });

  it("selects all existing text on focus, so typing replaces it instead of appending", async () => {
    const user = userEvent.setup();
    render(<ControlledField initial={0} />);
    const input = screen.getByLabelText(/Amount/) as HTMLInputElement;

    await user.click(input);
    await user.keyboard("500");

    expect(input.value).toBe("500");
  });

  it("keeps a trailing decimal point while typing instead of stripping it", async () => {
    const user = userEvent.setup();
    render(<ControlledField initial={5} />);
    const input = screen.getByLabelText(/Amount/) as HTMLInputElement;

    await user.clear(input);
    await user.type(input, "5.");

    expect(input.value).toBe("5.");
  });

  it("reports an empty field as NaN to the caller rather than coercing to 0", async () => {
    const user = userEvent.setup();
    let latest = 35;
    render(<NumberField label="Amount" help="help" unit="units" value={35} onChange={(v) => (latest = v)} />);
    const input = screen.getByLabelText(/Amount/) as HTMLInputElement;

    await user.clear(input);

    expect(Number.isNaN(latest)).toBe(true);
  });

  it("shows the error prop text when given one", () => {
    render(
      <NumberField label="Amount" help="help" unit="units" value={NaN} onChange={() => {}} error="Enter a number." />,
    );
    expect(screen.getByText("Enter a number.")).toBeTruthy();
  });

  it("re-syncs from an externally-changed value (e.g. switching industries)", () => {
    const { rerender } = render(
      <NumberField label="Amount" help="help" unit="units" value={900} onChange={() => {}} />,
    );
    const input = screen.getByLabelText(/Amount/) as HTMLInputElement;
    expect(input.value).toBe("900");

    rerender(<NumberField label="Amount" help="help" unit="units" value={600} onChange={() => {}} />);
    expect(input.value).toBe("600");
  });
});
