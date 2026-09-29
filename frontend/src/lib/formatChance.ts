/** Turns an engine probability (0-1) into the "X of 10 futures" wording the coach
 * already uses, so the whole app speaks one language about chance.
 * Only formats -- the probability itself always comes from the engine. */
export function chanceOutOf10(probability: number): string {
  const outOf10 = Math.round(probability * 10);
  if (outOf10 <= 0) return probability > 0 ? "less than 1 of 10 futures" : "none of 10 futures";
  if (outOf10 >= 10) return probability < 1 ? "almost all 10 futures" : "all 10 futures";
  return `${outOf10} of 10 futures`;
}

/** Money with an explicit + or − sign, e.g. "+$1,500" / "−$800". */
export function signed(value: number, format: (abs: number) => string): string {
  if (Math.round(value) === 0) return format(0);
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
}
