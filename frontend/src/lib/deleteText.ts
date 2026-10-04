import type { BusinessImpact, ScenarioImpact } from "../api";

/** The plain sentences in the "Are you sure?" box. They say what else goes with the thing being deleted. */

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface DeleteWords {
  title: string;
  lines: string[];
}

export function scenarioWords(name: string, impact: ScenarioImpact | null): DeleteWords {
  const lines: string[] = [];
  if (impact) {
    lines.push(
      impact.decisions === 0
        ? "It has no steps."
        : `This also deletes its ${plural(impact.decisions, "step (decision)", "steps (decisions)")}.`,
    );
    lines.push(
      impact.runs === 0
        ? "You have not made any runs with it."
        : `${plural(impact.runs, "run", "runs")} you already made with it stay in your history, with their results.`,
    );
  } else {
    lines.push("This also deletes its steps (decisions). Runs you already made with it stay in your history.");
  }
  return { title: `Delete “${name}”?`, lines };
}

export function runWords(id: number, scenarioNames: string[]): DeleteWords {
  const used = scenarioNames.filter((n) => n !== "baseline");
  return {
    title: `Delete run #${id}?`,
    lines: [
      `This removes the run${used.length ? ` (${used.join(", ")})` : ""} from your history, with its charts and the coach's notes about it.`,
      "The scenarios it used are not deleted.",
    ],
  };
}

export function businessWords(name: string, impact: BusinessImpact | null): DeleteWords {
  const lines: string[] = [];
  if (impact) {
    lines.push(
      impact.scenarios === 0 && impact.runs === 0
        ? "It has no scenarios or runs yet."
        : `This also deletes all of its ${plural(impact.scenarios, "scenario", "scenarios")} and ${plural(impact.runs, "saved run", "saved runs")}, with the coach's notes.`,
    );
  } else {
    lines.push("This also deletes all of its scenarios and saved runs, with the coach's notes.");
  }
  lines.push("Your other businesses are not affected.");
  return { title: `Delete “${name}”?`, lines };
}
