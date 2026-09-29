import type { ScenarioResultOut } from "../api";

/** "If you keep things as they are" is always first and always this quiet, dashed brown.
 * The others are warm café colors, dark enough to see on the cream background. */
export const PATH_COLORS = ["#8a7565", "#a0522d", "#4f6f3f", "#9a6b12"];

/** How a path is named to the owner. The engine calls the do-nothing path "baseline". */
export function pathName(r: Pick<ScenarioResultOut, "scenario_name">): string {
  return r.scenario_name === "baseline" ? "Keep things as they are" : r.scenario_name;
}
