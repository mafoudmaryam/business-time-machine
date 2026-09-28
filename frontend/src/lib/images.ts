import type { DecisionType } from "../constants";

/** Path to an industry's photo for one decision type, served from public/images. */
export function decisionTypeImage(industry: string, type: DecisionType): string {
  return `/images/${industry}/${type}.jpg`;
}

/** The "hours" photo doubles as the setup wizard's hero; "menu" doubles as the
 * comparison dashboard's hero -- see docs/redesign-plan.md and CREDITS.md. */
export function heroImage(industry: string, page: "setup" | "compare"): string {
  return decisionTypeImage(industry, page === "setup" ? "hours" : "menu");
}
