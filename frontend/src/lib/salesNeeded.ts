/** Input checks and exact display only. All targets are calculated by the standalone engine tool. */
export interface SalesNeededInput {
  selling_price: string;
  cost_per_sale: string;
  monthly_costs: string;
  opening_days: string;
}
export type SalesNeededField = keyof SalesNeededInput;
export interface SalesNeededResult {
  status: "target" | "no_margin";
  selling_price: string;
  cost_per_sale: string;
  monthly_costs: string;
  contribution_per_sale: string;
  opening_days: number | null;
  monthly_sales: string | null;
  daily_average: string | null;
  monthly_revenue: string | null;
  cost_share_percent: number | null;
}
export function validateToolField(field: SalesNeededField, raw: string): string | null {
  const text = raw.trim();
  if (field === "opening_days") {
    return !text || (/^[0-9]{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31)
      ? null : "Enter whole opening days from 1 to 31, or leave this blank.";
  }
  if (!text) return "Enter an amount. Enter 0 if there is no amount here.";
  if (text.length > 32 || !/^(?:\d+(?:\.\d*)?|\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d*)?)$/.test(text)) {
    return "Use a non-negative amount, such as 1200.50. Use a decimal point and optional thousands commas.";
  }
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  return whole.length > 12 || fraction.length > 6 ? "Use up to 12 digits before the decimal and 6 after it." : null;
}

export function formatToolCount(value: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(value));
}

/** Format engine decimal strings without passing large values through Number or losing sub-cent costs. */
export function formatToolMoney(value: string, currency: string, locale?: string): string {
  const negative = value.startsWith("-");
  const [wholeText, tail = ""] = value.replace(/^-/, "").split(".");
  const whole = BigInt(wholeText);
  const fraction = tail.replace(/0+$/, "");
  try {
    const normalDigits = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const digits = Math.max(normalDigits, fraction.length);
    const formatter = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    const negativeZero = negative && whole === 0n;
    const signedWhole = negativeZero ? -1n : negative ? -whole : whole;
    return formatter.formatToParts(signedWhole).map(part => {
      if (part.type === "fraction") return fraction.padEnd(digits, "0");
      if (part.type === "integer" && negativeZero) return "0";
      return part.value;
    }).join("");
  } catch {
    return `${negative ? "-" : ""}${currency} ${formatToolCount(wholeText, locale)}${fraction ? `.${fraction}` : ""}`;
  }
}

export function formatDailyAverage(value: string, locale?: string): string {
  const [whole, fraction] = value.split(".");
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
  return `${formatToolCount(whole, locale)}${fraction ? decimal + fraction : ""}`;
}
