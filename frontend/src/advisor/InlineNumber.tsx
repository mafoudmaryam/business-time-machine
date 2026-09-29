import { useState } from "react";

interface Props {
  /** Read out by screen readers, since the visible label is the sentence around it. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Roughly how many characters wide the box should be. */
  width?: number;
  invalid?: boolean;
}

function toText(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "" : String(value);
}

/** A small number box that sits inside a sentence ("Raise prices by [10] %").
 * Like NumberField, it lets the box be empty while you type (reported as NaN) instead of
 * forcing a 0, and only re-syncs when the number changes from outside. */
export function InlineNumber({ label, value, onChange, width = 4, invalid = false }: Props) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // The number was changed from outside (not by typing here): show the new number.
  if (!Object.is(value, lastValue)) {
    setLastValue(value);
    if (!Object.is(Number(text.trim() === "" ? NaN : text), value)) setText(toText(value));
  }

  return (
    <input
      className="inline-number"
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid ? "true" : undefined}
      style={{ width: `${width + 1.5}ch` }}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value));
      }}
    />
  );
}
