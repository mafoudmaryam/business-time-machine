export const DEFAULT_CURRENCY = "USD";

/** The symbol/prefix Intl uses for a currency in the user's own locale,
 * e.g. "$" for USD, "¥" for JPY, "CN¥" for CNY -- used for compact unit
 * labels like "($/visit)" without hard-coding any one currency. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(0);
    return parts.filter((p) => p.type === "currency").map((p) => p.value).join("");
  } catch {
    return currency;
  }
}

/** Replaces the "{CUR}" placeholder used in FieldSpec.unit / decision unit templates. */
export function formatUnit(unitTemplate: string, currency: string): string {
  return unitTemplate.replace("{CUR}", currencySymbol(currency));
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currencySymbol(currency)}${Math.round(value).toLocaleString()}`;
  }
}

/** value is already a 0-100 number, e.g. formatPercent(10) -> "10%". */
export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function formatMonth(month: number): string {
  return `month ${month}`;
}

export function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

/** True when a money field (unit contains "{CUR}") still shows the US-dollar example
 * while the business uses another currency, so the owner should type their own amount. */
export function needsOwnAmount(field: { key: string; unit: string }, currency: string, editedMoney: Set<string>): boolean {
  return currency !== "USD" && field.unit.includes("{CUR}") && !editedMoney.has(field.key);
}

/** Like formatMoney, but keeps the cents for small amounts such as a price per visit
 * ($6.50, not $7). Large amounts are still shown in whole units. */
export function formatPrice(value: number, currency: string): string {
  if (Math.abs(value) >= 100 || Number.isInteger(value)) return formatMoney(value, currency);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); // the currency's own decimals: $6.50, ¥8
  } catch {
    return formatMoney(value, currency);
  }
}
