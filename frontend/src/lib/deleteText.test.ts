import { describe, expect, it } from "vitest";
import { businessWords, runWords, scenarioWords } from "./deleteText";

describe("scenarioWords", () => {
  it("counts steps and runs, singular and plural", () => {
    expect(scenarioWords("A", { decisions: 1, runs: 1 }).lines).toEqual([
      "This also deletes its 1 step (decision).",
      "1 run you already made with it stay in your history, with their results.",
    ]);
    expect(scenarioWords("A", { decisions: 3, runs: 2 }).lines[0]).toBe("This also deletes its 3 steps (decisions).");
  });

  it("says plainly when there is nothing else", () => {
    expect(scenarioWords("A", { decisions: 0, runs: 0 }).lines).toEqual(["It has no steps.", "You have not made any runs with it."]);
  });

  it("has a general version when the numbers are not known yet", () => {
    expect(scenarioWords("A", null).lines.join(" ")).toContain("Runs you already made with it stay in your history");
  });

  it("puts the name in the title", () => {
    expect(scenarioWords("Raise prices", null).title).toBe("Delete “Raise prices”?");
  });
});

describe("businessWords", () => {
  it("says what goes with the business", () => {
    expect(businessWords("Cafe", { scenarios: 2, runs: 5 }).lines[0]).toBe(
      "This also deletes all of its 2 scenarios and 5 saved runs, with the coach's notes.",
    );
    expect(businessWords("Cafe", { scenarios: 1, runs: 1 }).lines[0]).toContain("1 scenario and 1 saved run");
  });

  it("is calm about an empty business, and reassures about the others", () => {
    const words = businessWords("Cafe", { scenarios: 0, runs: 0 });
    expect(words.lines[0]).toBe("It has no scenarios or runs yet.");
    expect(words.lines).toContain("Your other businesses are not affected.");
  });
});

describe("runWords", () => {
  it("names the scenarios, ignoring the always-included baseline", () => {
    const words = runWords(12, ["baseline", "Raise prices", "Hire"]);
    expect(words.title).toBe("Delete run #12?");
    expect(words.lines[0]).toContain("(Raise prices, Hire)");
    expect(words.lines[0]).not.toContain("baseline");
  });

  it("works for a run that only had the baseline", () => {
    expect(runWords(1, ["baseline"]).lines[0]).toBe("This removes the run from your history, with its charts and the coach's notes about it.");
  });
});
