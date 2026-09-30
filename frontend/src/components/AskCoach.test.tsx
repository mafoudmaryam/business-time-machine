import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { AskCoach } from "./AskCoach";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, askCoach: vi.fn(), getAsk: vi.fn() };
});

function reply(over: Partial<api.AskOut> = {}): api.AskOut {
  return {
    id: 1, question: "q", answer: "Instant answer from the facts.", mode: "template", fallback: false,
    ai_status: "none", answered: true, suggestions: [], ...over,
  };
}

const CHIPS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"];

describe("AskCoach", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AskCoach runId={9} />);
    return user;
  }

  it("offers the three questions as chips and gets an instant answer for each, with no waiting line", async () => {
    const user = setup();
    for (const chip of CHIPS) {
      vi.mocked(api.askCoach).mockResolvedValueOnce(reply({ question: chip, answer: `Answer to ${chip}` }));
      await user.click(screen.getByRole("button", { name: chip }));
      expect(await screen.findByText(`Answer to ${chip}`)).toBeTruthy();
    }
    expect(screen.queryByText(/adding more detail/)).toBeNull();
    expect(api.getAsk).not.toHaveBeenCalled(); // nothing to wait for
  });

  it("shows the question and the answer as chat bubbles, newest first", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValueOnce(reply({ answer: "First answer." })).mockResolvedValueOnce(reply({ id: 2, answer: "Second answer." }));
    await user.click(screen.getByRole("button", { name: CHIPS[0] }));
    await screen.findByText("First answer.");
    await user.click(screen.getByRole("button", { name: CHIPS[1] }));
    await screen.findByText("Second answer.");
    const items = within(screen.getByRole("list", { name: /questions and the coach's answers/ })).getAllByRole("listitem");
    expect(items[0].textContent).toContain(CHIPS[1]);
    expect(items[1].textContent).toContain(CHIPS[0]);
  });

  it("shows the instant answer at once with a calm line, then swaps in the AI answer with a tag", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValue(reply({ ai_status: "pending", answer: "Instant answer." }));
    vi.mocked(api.getAsk)
      .mockResolvedValueOnce(reply({ ai_status: "pending", answer: "Instant answer." }))
      .mockResolvedValue(reply({ ai_status: "done", mode: "ollama", answer: "A better, more detailed answer." }));
    await user.type(screen.getByLabelText("Your question"), "Any thoughts on my money?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Instant answer.")).toBeTruthy();
    expect(screen.getByText("Your coach is adding more detail…")).toBeTruthy();
    expect(screen.queryByText(/\d:\d\d/)).toBeNull(); // no timer
    expect((screen.getByLabelText("Your question") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled).toBe(true); // empty box, not "Thinking…"

    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText("Instant answer.")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await screen.findByText("A better, more detailed answer.")).toBeTruthy();
    expect(screen.getByText("Updated with more detail")).toBeTruthy();
    expect(screen.queryByText("Your coach is adding more detail…")).toBeNull();
    expect(api.getAsk).toHaveBeenCalledWith(1);
  });

  it("keeps the instant answer, with no error, when the AI fails", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValue(reply({ ai_status: "pending", answer: "Instant answer." }));
    vi.mocked(api.getAsk).mockResolvedValue(reply({ ai_status: "failed", fallback: true, answer: "Instant answer." }));
    await user.type(screen.getByLabelText("Your question"), "Any thoughts?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Instant answer.");
    await vi.advanceTimersByTimeAsync(3100);
    await waitFor(() => expect(screen.queryByText(/adding more detail/)).toBeNull());
    expect(screen.getByText("Instant answer.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Updated with more detail")).toBeNull();
  });

  it("stops polling after a minute and keeps the instant answer", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValue(reply({ ai_status: "pending", answer: "Instant answer." }));
    vi.mocked(api.getAsk).mockResolvedValue(reply({ ai_status: "pending", answer: "Instant answer." }));
    await user.type(screen.getByLabelText("Your question"), "Any thoughts?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Your coach is adding more detail…");

    await vi.advanceTimersByTimeAsync(63_000);
    await waitFor(() => expect(screen.queryByText("Your coach is adding more detail…")).toBeNull());
    const calls = vi.mocked(api.getAsk).mock.calls.length;
    expect(calls).toBeLessThanOrEqual(21);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.mocked(api.getAsk).mock.calls.length).toBe(calls); // no more polling
    expect(screen.getByText("Instant answer.")).toBeTruthy();
  });

  it("ignores a failed poll and keeps waiting", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValue(reply({ ai_status: "pending" }));
    vi.mocked(api.getAsk)
      .mockRejectedValueOnce(new api.ApiError(0, "offline"))
      .mockResolvedValue(reply({ ai_status: "done", answer: "The detailed one." }));
    await user.type(screen.getByLabelText("Your question"), "Any thoughts?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Your coach is adding more detail…");
    await vi.advanceTimersByTimeAsync(3100);
    expect(screen.queryByRole("alert")).toBeNull();
    await vi.advanceTimersByTimeAsync(3100);
    expect(await screen.findByText("The detailed one.")).toBeTruthy();
  });

  it("says kindly when it can't answer, and offers the three chips right there", async () => {
    const user = setup();
    vi.mocked(api.askCoach)
      .mockResolvedValueOnce(reply({ answer: "I can't answer that one yet. Try one of these:", answered: false, suggestions: CHIPS }))
      .mockResolvedValueOnce(reply({ id: 2, answer: "Here is the cash answer." }));
    await user.type(screen.getByLabelText("Your question"), "Who won the football?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("I can't answer that one yet. Try one of these:")).toBeTruthy();

    const group = screen.getByRole("group", { name: "Try one of these questions" });
    await user.click(within(group).getByRole("button", { name: CHIPS[0] }));
    expect(api.askCoach).toHaveBeenLastCalledWith(9, CHIPS[0]);
    expect(await screen.findByText("Here is the cash answer.")).toBeTruthy();
  });

  it("turns any error into one friendly line with a Try again link, never a stuck button", async () => {
    const user = setup();
    vi.mocked(api.askCoach)
      .mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error"))
      .mockResolvedValueOnce(reply({ answer: "Now it works." }));
    await user.type(screen.getByLabelText("Your question"), "How is my cash?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/We couldn't get an answer just now\./);
    expect(alert.textContent).not.toMatch(/500|Internal/);
    expect(screen.queryByText("One moment…")).toBeNull();
    expect((screen.getByLabelText("Your question") as HTMLInputElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.askCoach).toHaveBeenLastCalledWith(9, "How is my cash?");
    expect(await screen.findByText("Now it works.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not send an empty question", async () => {
    const user = setup();
    expect((screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Your question"), "   ");
    expect((screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.askCoach).not.toHaveBeenCalled();
  });

  it("works from the keyboard: type, press Enter, and the answer is announced politely", async () => {
    const user = setup();
    vi.mocked(api.askCoach).mockResolvedValue(reply({ answer: "Typed answer." }));
    await user.click(screen.getByLabelText("Your question"));
    await user.keyboard("How is my cash?{Enter}");
    expect(api.askCoach).toHaveBeenCalledWith(9, "How is my cash?");
    expect(await screen.findByText("Typed answer.")).toBeTruthy();
    expect(screen.getByRole("list", { name: /questions and the coach's answers/ }).getAttribute("aria-live")).toBe("polite");
    expect((screen.getByLabelText("Your question") as HTMLInputElement).value).toBe(""); // ready for the next one
  });

  it("lets the owner ask again while an earlier answer is still improving", async () => {
    const user = setup();
    vi.mocked(api.askCoach)
      .mockResolvedValueOnce(reply({ ai_status: "pending", answer: "First instant." }))
      .mockResolvedValueOnce(reply({ id: 2, answer: "Second instant." }));
    await user.type(screen.getByLabelText("Your question"), "One?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("First instant.");
    await user.click(screen.getByRole("button", { name: CHIPS[0] }));
    expect(await screen.findByText("Second instant.")).toBeTruthy();
    expect(screen.getByText("First instant.")).toBeTruthy();
  });
});
