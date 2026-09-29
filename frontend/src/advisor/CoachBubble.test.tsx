import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { CoachBubble } from "./CoachBubble";
import { resetCoachStore } from "./coachStore";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, getCoachStatus: vi.fn(), requestCoach: vi.fn(), getCoach: vi.fn() };
});

const ruleBased: api.CoachOut = {
  mode: "template", model: null as unknown as string, fallback: false,
  headline: "Rule-based headline.", what_happens: "Short version.", why: "", watch_out: [], ideas: [],
  generated_at: "", ai_status: "pending",
};
const aiVersion: api.CoachOut = { ...ruleBased, mode: "ollama", headline: "AI headline.", ai_status: "done", generated_at: "later" };

describe("CoachBubble", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetCoachStore();
    vi.mocked(api.getCoachStatus).mockResolvedValue({ enabled: true, mode: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    resetCoachStore();
  });

  it("shows the rule-based notes at once, then swaps in the AI's version", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.requestCoach).mockResolvedValue(ruleBased);
    vi.mocked(api.getCoach).mockResolvedValueOnce(ruleBased).mockResolvedValue(aiVersion);
    render(<CoachBubble runId={3} />);

    expect(await screen.findByText("Rule-based headline.")).toBeTruthy();
    expect(screen.getByText("Your advisor is adding more detail…")).toBeTruthy();
    expect(screen.queryByText(/\d:\d\d/)).toBeNull(); // no counting seconds
    expect(screen.queryByText("Updated with more detail")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(await screen.findByText("AI headline.")).toBeTruthy();
    expect(screen.queryByText(/adding more detail/)).toBeNull();
    expect(screen.getByText("Updated with more detail")).toBeTruthy();
  });

  it("offers to try again after an error, without showing the technical message", async () => {
    const user = userEvent.setup();
    vi.mocked(api.requestCoach).mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error")).mockResolvedValue({
      ...ruleBased,
      ai_status: "none",
    });
    render(<CoachBubble runId={4} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/500|Internal/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Rule-based headline.")).toBeTruthy();
  });

  it("shows nothing when the coach is switched off", async () => {
    vi.mocked(api.requestCoach).mockRejectedValue(new api.ApiError(404, "the coach is switched off"));
    const { container } = render(<CoachBubble runId={5} />);
    await vi.waitFor(() => expect(api.requestCoach).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });
});
