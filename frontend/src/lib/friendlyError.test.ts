import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "./friendlyError";

describe("friendlyErrorMessage", () => {
  it("rewrites a single unconfirmed scenario into the exact requested wording", () => {
    expect(friendlyErrorMessage("scenario(s) have unconfirmed decisions: Unconfirmed idea"))
      .toBe("Please confirm the decisions in 'Unconfirmed idea' before running a simulation.");
  });

  it("joins two unconfirmed scenario names with 'and'", () => {
    expect(friendlyErrorMessage("scenario(s) have unconfirmed decisions: A, B"))
      .toBe("Please confirm the decisions in 'A' and 'B' before running a simulation.");
  });

  it("joins three or more names with commas and a trailing 'and'", () => {
    expect(friendlyErrorMessage("scenario(s) have unconfirmed decisions: A, B, C"))
      .toBe("Please confirm the decisions in 'A', 'B' and 'C' before running a simulation.");
  });

  it("passes through messages it doesn't recognize unchanged", () => {
    expect(friendlyErrorMessage("business not found")).toBe("business not found");
    expect(friendlyErrorMessage("Could not reach the API.")).toBe("Could not reach the API.");
  });
});
