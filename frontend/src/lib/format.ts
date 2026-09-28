import { CURRENCY } from "../constants";

/** Replaces the "{CUR}" placeholder used in FieldSpec.unit / decision unit templates. */
export function formatUnit(unitTemplate: string): string {
  return unitTemplate.replace("{CUR}", CURRENCY);
}

export function formatMoney(value: number): string {
  const rounded = Math.round(value).toLocaleString();
  return `${CURRENCY}${rounded}`;
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
