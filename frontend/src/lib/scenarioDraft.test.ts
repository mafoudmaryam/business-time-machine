import { describe, expect, it } from "vitest";
import { saveBlocker } from "./scenarioDraft";

describe("saveBlocker", () => {
  it("asks for a name first", () => {
    expect(saveBlocker("  ", [{ confirmed: true }])).toBe("Give this what-if a name.");
  });

  it("asks for at least one change", () => {
    expect(saveBlocker("Raise prices", [])).toBe("Add at least one change.");
  });

  it("blocks saving until every change is confirmed", () => {
    expect(saveBlocker("Raise prices", [{ confirmed: false }])).toMatch(/Confirm/);
    expect(saveBlocker("Raise prices", [{ confirmed: true }, { confirmed: false }, { confirmed: false }])).toMatch(
      /2 steps/,
    );
  });

  it("allows saving when everything is confirmed", () => {
    expect(saveBlocker("Raise prices", [{ confirmed: true }, { confirmed: true }])).toBeNull();
  });
});
