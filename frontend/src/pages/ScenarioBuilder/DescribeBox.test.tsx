import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { DescribeBox } from "./DescribeBox";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, interpretText: vi.fn(), getInterpretation: vi.fn() };
});

const priceStep: api.InterpretedDecision = {
  type: "price", start_month: 6, value: 10, unit: "percent", source_quote: "Raise prices 10% in March",
  sentence: "Raise prices 10%, from March 2027 (month 6)", when_label: "March 2027 (month 6)", group: null, role: null,
  group_sentence: null,
};

function reading(over: Partial<api.Interpretation> = {}): api.Interpretation {
  return {
    id: 7, business_id: 1, text: "Raise prices 10% in March", status: "done", provider: null, fallback: null,
    decisions: [priceStep], questions: [], out_of_scope: null, notes: [], month_one: "", ...over,
  };
}

const asking = reading({
  text: "Raise prices a bit",
  decisions: [],
  questions: [
    { id: "0:amount", slot: "amount", text: "By how much do you want to raise prices?", about: "Raise prices a bit", options: null, hint: "e.g. 10%" },
    { id: "0:when", slot: "when", text: "When do you want this to start?", about: "Raise prices a bit", options: ["Next month", "In 3 months"], hint: "e.g. next month, March" },
  ],
});

function setup(onInterpreted = vi.fn(), currency = "USD") {
  render(<DescribeBox businessId={1} staffNoun="baker" currency={currency} onInterpreted={onInterpreted} />);
  return onInterpreted;
}

describe("DescribeBox", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("invites the owner to write in their own words, with the month and season hint", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Describe it in your own words" })).toBeTruthy();
    expect(screen.getByLabelText("What would you like to change?")).toBeTruthy();
    expect(screen.getByText(/Month 1 is [A-Z][a-z]+ \d{4}, the month after this one\./)).toBeTruthy();
    expect(screen.getByText(/“Summer” means June to August\./)).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("offers example chips in the business's own words and currency, and a chip fills the box", async () => {
    const user = userEvent.setup();
    setup(vi.fn(), "EUR");
    const group = screen.getByRole("group", { name: "Examples you can try" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([
      "Raise prices 5% next month",
      "Hire a part-time baker",
      "Spend €500 a month on Instagram",
      "Open 6 days a week from next month",
    ]);
    await user.click(chips[1]);
    expect((screen.getByLabelText("What would you like to change?") as HTMLTextAreaElement).value).toBe("Hire a part-time baker");
  });

  it("cannot be sent empty", () => {
    setup();
    expect((screen.getByRole("button", { name: "Turn this into steps" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the words, shows a friendly loading line, then hands the reading over", async () => {
    const user = userEvent.setup();
    let finish: (r: api.Interpretation) => void = () => undefined;
    vi.mocked(api.interpretText).mockReturnValue(new Promise((res) => (finish = res)));
    const onInterpreted = setup();

    await user.type(screen.getByLabelText("What would you like to change?"), "Raise prices 10% in March");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));

    expect(api.interpretText).toHaveBeenCalledWith(1, "Raise prices 10% in March", []);
    expect(screen.getByText("Reading what you wrote…")).toBeTruthy();

    finish(reading());
    expect(await screen.findByText(/I found 1 step\./)).toBeTruthy();
    expect(onInterpreted).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(screen.queryByText("Reading what you wrote…")).toBeNull();
  });

  it("keeps polling while the AI is still reading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(api.interpretText).mockResolvedValue(reading({ status: "pending", decisions: [] }));
      vi.mocked(api.getInterpretation).mockResolvedValueOnce(reading({ status: "pending", decisions: [] })).mockResolvedValue(reading());
      const onInterpreted = setup();

      await user.type(screen.getByLabelText("What would you like to change?"), "Raise prices 10% in March");
      await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
      expect(screen.getByText("Reading what you wrote…")).toBeTruthy();

      await vi.advanceTimersByTimeAsync(1600);
      expect(onInterpreted).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1600);
      await waitFor(() => expect(onInterpreted).toHaveBeenCalledTimes(1));
      expect(api.getInterpretation).toHaveBeenCalledWith(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks its questions in plain words, with the owner's words softly above each", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockResolvedValue(asking);
    setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "Raise prices a bit");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));

    expect(await screen.findByText(/1 question needs|2 questions need/)).toBeTruthy();
    expect(screen.getByLabelText("By how much do you want to raise prices?")).toBeTruthy();
    expect(screen.getByLabelText("When do you want this to start?")).toBeTruthy();
    expect(screen.getAllByText("About: “Raise prices a bit”")).toHaveLength(2);
    expect(screen.getByPlaceholderText("e.g. 10%")).toBeTruthy();
  });

  it("re-reads with the answers (typed or from a quick answer) and never before something is answered", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockResolvedValueOnce(asking).mockResolvedValueOnce(reading({ text: "Raise prices a bit" }));
    const onInterpreted = setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "Raise prices a bit");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    await screen.findByLabelText("By how much do you want to raise prices?");

    const update = screen.getByRole("button", { name: "Update the steps" }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);

    await user.type(screen.getByLabelText("By how much do you want to raise prices?"), "10%");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("button", { name: "Next month" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(update);

    expect(api.interpretText).toHaveBeenLastCalledWith(1, "Raise prices a bit", [
      { id: "0:amount", question: "By how much do you want to raise prices?", answer: "10%" },
      { id: "0:when", question: "When do you want this to start?", answer: "Next month" },
    ]);
    await waitFor(() => expect(onInterpreted).toHaveBeenCalledTimes(2));
  });

  it("says kindly what it cannot do and lists what it can", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockResolvedValue(
      reading({
        decisions: [],
        out_of_scope: {
          message: "I can't simulate that yet: “open a second shop”.",
          can_do: ["Change your prices", "Hire or let go of staff"],
          quotes: ["open a second shop"],
        },
      }),
    );
    setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "open a second shop");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    expect(await screen.findByText("I can't simulate that yet: “open a second shop”.")).toBeTruthy();
    expect(screen.getByText("Here's what I can simulate:")).toBeTruthy();
    expect(screen.getByText("Change your prices")).toBeTruthy();
    expect(screen.getByText(/I couldn't turn that into a step\./)).toBeTruthy();
  });

  it("shows the notes, such as what 'summer' means", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockResolvedValue(reading({ notes: ["Summer means June to August."] }));
    setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "x");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    expect(await screen.findByText("Summer means June to August.")).toBeTruthy();
  });

  it("shows a friendly error, never a raw one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockRejectedValue(new api.ApiError(500, "Internal Server Error"));
    setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "x");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Something went wrong while reading that/);
    expect(alert.textContent).not.toMatch(/500|Internal/);
  });

  it("passes on a plain-language message from the server (e.g. too long)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockRejectedValue(new api.ApiError(422, "That is a bit long. Please keep it under 1000 characters."));
    setup();
    await user.type(screen.getByLabelText("What would you like to change?"), "x");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/a bit long/);
  });

  it("announces progress and results politely for screen readers", async () => {
    const user = userEvent.setup();
    vi.mocked(api.interpretText).mockResolvedValue(reading());
    setup();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    await user.type(screen.getByLabelText("What would you like to change?"), "x");
    await user.click(screen.getByRole("button", { name: "Turn this into steps" }));
    const summary = await screen.findByText(/I found 1 step\./);
    expect(summary.getAttribute("aria-live")).toBe("polite");
    expect(summary.textContent).toMatch(/tick it to confirm/);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
