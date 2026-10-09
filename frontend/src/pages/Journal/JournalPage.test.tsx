import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { celebrate } from "../../lib/celebrate";
import { App } from "../../App";
import { UndoProvider } from "../../components/UndoProvider";
import { track } from "../../lib/events";
import { rememberBusiness } from "../../lib/session";
import { makeJournal, makeJournalMonth, makeToday } from "../../test-fixtures";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, getJournal: vi.fn(), saveJournalEntry: vi.fn(), deleteJournalEntry: vi.fn(), restoreJournalEntry: vi.fn(),
    getToday: vi.fn(), getTodayNote: vi.fn(), getBusinessImpact: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));
vi.mock("../../lib/celebrate", () => ({ celebrate: vi.fn(), prefersReducedMotion: () => false }));
vi.mock("../Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));

function mount(path = "/journal") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <App />
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const box = (name: RegExp) => screen.getByRole("textbox", { name });

const NOV = { month: "2026-11", month_label: "November 2026" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 11, 10, 9, 0, 0));
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  rememberBusiness(1);
  vi.mocked(api.getJournal).mockResolvedValue(makeJournal());
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 1, runs: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function fill(user: ReturnType<typeof userEvent.setup>, profit: string, cash: string, visits: string) {
  await user.type(box(/What you kept/), profit);
  await user.type(box(/Money in the bank/), cash);
  await user.type(box(/Customer visits/), visits);
}

describe("the journal page", () => {
  it("has a heading, a pilot label, and a Back button", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: /My journal/ })).toBeTruthy();
    expect(screen.getByText("Pilot feature")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
  });

  it("goes to the start screen when no business is open", async () => {
    window.sessionStorage.clear();
    mount();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /My journal/ })).toBeNull());
    expect(api.getJournal).not.toHaveBeenCalled();
  });

  it("shows a friendly empty state when nothing is written down", async () => {
    mount();
    expect(await screen.findByRole("region", { name: "Nothing written down yet" })).toBeTruthy();
  });

  it("explains the figures in plain words, with no jargon", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(box(/What you kept/).closest(".field")?.textContent).toMatch(/minus sign/i);
    expect(document.body.textContent).not.toMatch(/p10|p50|p90|baseline|COGS|FTE/);
  });

  it("shows a saved month with a sentence, a bar and where it landed for each of the three figures", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()] }));
    mount();
    const card = (await screen.findByRole("heading", { level: 3, name: "November 2026" })).closest("li") as HTMLElement;
    const c = within(card);
    expect(c.getByText(/You made about \$5,900\. We expected \$4,800 to \$7,300/)).toBeTruthy();
    expect(c.getByText(/so it landed inside the range we showed/)).toBeTruthy();
    expect(c.getByText(/came in below the range/)).toBeTruthy();
    expect(c.getByText(/came in better than the range/)).toBeTruthy();
    expect(c.getAllByRole("img")).toHaveLength(3);
    expect(c.getByText("Inside the range we showed")).toBeTruthy();
    expect(c.getByText("Lower than we expected")).toBeTruthy();
    expect(c.getByText("Better than we expected")).toBeTruthy();
  });

  it("says plainly when there was no forecast for a month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(
      makeJournal({
        entries: [
          makeJournalMonth({
            month: "2026-10", label: "October 2026", has_prediction: false, prediction_run_id: null, comparisons: [],
            summary: "We had no forecast for October 2026, so there is nothing to compare it with. Your figures are saved.",
          }),
        ],
      }),
    );
    mount();
    expect(await screen.findByText(/We had no forecast for October 2026/)).toBeTruthy();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("shows the owner's note as theirs", async () => {
    const m = makeJournalMonth();
    m.entry.note = "Road closed for a week";
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [m] }));
    mount();
    expect(await screen.findByText("Your note: Road closed for a week")).toBeTruthy();
  });

  it("opens with the card 'How did last month go?' on last month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [NOV] }));
    mount();
    expect(await screen.findByRole("heading", { level: 2, name: "How did last month go?" })).toBeTruthy();
    expect((screen.getByLabelText("Which month?") as HTMLSelectElement).value).toBe("2026-11");
  });

  it("lists an older month that is still waiting, and its button picks that month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [{ month: "2026-10", month_label: "October 2026" }] }));
    const { user } = mount();
    expect(await screen.findByText("How did October really go?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Write it down" }));
    expect((screen.getByLabelText("Which month?") as HTMLSelectElement).value).toBe("2026-10");
  });

  it("shows the summary in plain words, with the chart and the download button", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(
      makeJournal({
        entries: [makeJournalMonth()],
        forecast: {
          run_id: 10,
          months: [
            { month: "2026-11", month_label: "November 2026", p10: 4800, p50: 6000, p90: 7300 },
            { month: "2026-12", month_label: "December 2026", p10: 4900, p50: 6100, p90: 7400 },
          ],
        },
      }),
    );
    mount();
    expect(await screen.findByText(/You have recorded 1 month\. 1 of 1 month we could compare landed inside our range\./)).toBeTruthy();
    const chart = screen.getByRole("img", { name: /What you keep each month, November 2026 to December 2026/ });
    expect(chart.getAttribute("aria-label")).toMatch(/Dots mark the month you wrote down: November 2026/);
    expect(screen.getByRole("button", { name: "Download my journal (CSV)" })).toBeTruthy();
  });

  it("downloads the journal as a CSV file, nothing else", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()] }));
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (created.push(b as Blob), "blob:x"));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Download my journal (CSV)" }));
    expect(created).toHaveLength(1);
    expect(created[0].type).toMatch(/text\/csv/);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it("has no download button and no summary when nothing is written down", async () => {
    mount();
    await screen.findByRole("region", { name: "Nothing written down yet" });
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
    expect(screen.queryByText(/You have recorded/)).toBeNull();
  });

  it("is the fourth link in the top bar", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    const link = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "My journal" });
    expect(link.getAttribute("href")).toBe("/journal");
    expect(link.className).toContain("active");
  });

  it("opens on the month in the address", async () => {
    mount("/journal?month=2026-08");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect((screen.getByLabelText("Which month?") as HTMLSelectElement).value).toBe("2026-08"));
  });
});

describe("writing a month down", () => {
  it("saves what was typed, tells the owner, and reloads the page's figures", async () => {
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await user.selectOptions(screen.getByLabelText("Which month?"), "2026-11");
    await fill(user, "5900", "52000", "4200");
    await user.type(screen.getByLabelText(/A note for yourself/), "  slow start  ");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    await waitFor(() => expect(api.saveJournalEntry).toHaveBeenCalledTimes(1));
    expect(api.saveJournalEntry).toHaveBeenCalledWith(1, {
      month: "2026-11", actual_profit: 5900, actual_cash: 52000, actual_visits: 4200, note: "slow start",
    });
    expect(await screen.findByText("Saved November 2026.")).toBeTruthy();
    expect(api.getJournal).toHaveBeenCalledTimes(2);
  });

  it("celebrates once, only after the month is really saved", async () => {
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    expect(celebrate).not.toHaveBeenCalled(); // opening the page, or seeing numbers, is never celebrated
    await fill(user, "5900", "52000", "4200");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    await screen.findByText(/^Saved /);
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it("does not celebrate when the save fails or when a box is empty", async () => {
    vi.mocked(api.saveJournalEntry).mockRejectedValue(new Error("boom"));
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Save this month" })); // empty boxes: refused before saving
    await fill(user, "5900", "52000", "4200");
    await user.click(screen.getByRole("button", { name: "Save this month" })); // the server says no
    await screen.findByText(/couldn't save that just now/);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("accepts amounts typed the way people type them: 5,200 and $5200", async () => {
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "5,200", "$5200", "4,200");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    await waitFor(() => expect(api.saveJournalEntry).toHaveBeenCalled());
    expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({ actual_profit: 5200, actual_cash: 5200, actual_visits: 4200 });
  });

  it("asks for a number rather than guessing at something like 5,2", async () => {
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "5,2", "100", "100");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    expect(api.saveJournalEntry).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please enter a number.")).toHaveLength(1);
  });

  it("accepts a loss", async () => {
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "-400", "1000", "800");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    await waitFor(() => expect(api.saveJournalEntry).toHaveBeenCalled());
    expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1].actual_profit).toBe(-400);
  });

  it("does not save, and names what is missing, when a box is empty (never filling in a 0)", async () => {
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    expect(api.saveJournalEntry).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please enter a number.")).toHaveLength(3);
  });

  it("refuses negative visits", async () => {
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "100", "100", "-5");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    expect(api.saveJournalEntry).not.toHaveBeenCalled();
    expect(screen.getByText("This can't be less than 0.")).toBeTruthy();
  });

  it("shows a calm message, not the raw error, when saving fails, and keeps what was typed", async () => {
    vi.mocked(api.saveJournalEntry).mockRejectedValue(new api.ApiError(500, "Traceback: IntegrityError at 127.0.0.1"));
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "100", "200", "300");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't save that just now/);
    expect(alert.textContent).not.toMatch(/Traceback|IntegrityError|127\.0\.0\.1|500/);
    expect((box(/What you kept/) as HTMLInputElement).value).toBe("100");
  });

  it("logs that a month was saved, without the note or any figures", async () => {
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await screen.findByRole("heading", { level: 1 });
    await fill(user, "5900", "52000", "4200");
    await user.type(screen.getByLabelText(/A note for yourself/), "private words");
    await user.click(screen.getByRole("button", { name: "Save this month" }));
    await screen.findByText(/^Saved /);
    const calls = vi.mocked(track).mock.calls.filter((c) => c[0] === "journal_saved");
    expect(calls).toEqual([["journal_saved", "journal", { edited: false, compared: true }]]);
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(/private words|5900|52000/);
  });
});

describe("changing a month", () => {
  it("Edit fills the form with that month, and saving again is a change", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()] }));
    vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: "Edit November 2026" }));
    expect((screen.getByLabelText("Which month?") as HTMLSelectElement).value).toBe("2026-11");
    await waitFor(() => expect((box(/What you kept/) as HTMLInputElement).value).toBe("5900"));
    expect((box(/Customer visits/) as HTMLInputElement).value).toBe("4300");
    expect(screen.getByRole("heading", { name: "Change what you wrote" })).toBeTruthy();
    await user.clear(box(/What you kept/));
    await user.type(box(/What you kept/), "6100");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveJournalEntry).toHaveBeenCalled());
    expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({ month: "2026-11", actual_profit: 6100, actual_cash: 52000 });
    expect(await screen.findByText("Updated November 2026.")).toBeTruthy();
  });
});

describe("deleting a month", () => {
  async function openDelete() {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()] }));
    const view = mount();
    await view.user.click(await screen.findByRole("button", { name: "Delete November 2026" }));
    return view;
  }

  it("asks first, in plain words, and Cancel changes nothing", async () => {
    const { user } = await openDelete();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete your November 2026 figures?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deleteJournalEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes, refreshes, and Undo puts it back", async () => {
    vi.mocked(api.deleteJournalEntry).mockResolvedValue({ id: 1, kind: "journal", name: "November 2026", deleted_at: "2026-12-10T10:00:00" });
    vi.mocked(api.restoreJournalEntry).mockResolvedValue(makeJournalMonth());
    const { user } = await openDelete();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteJournalEntry).toHaveBeenCalledWith(1, "2026-11"));
    expect(await screen.findByText("Deleted your November 2026 figures.")).toBeTruthy();
    const before = vi.mocked(api.getJournal).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(api.restoreJournalEntry).toHaveBeenCalledWith(1, "2026-11"));
    await waitFor(() => expect(vi.mocked(api.getJournal).mock.calls.length).toBeGreaterThan(before));
  });
});

describe("when the journal cannot be loaded", () => {
  it("says so calmly, with Try again, and no raw error", async () => {
    vi.mocked(api.getJournal).mockRejectedValueOnce(new api.ApiError(500, "Internal Server Error: sqlite3.OperationalError"));
    const { user } = mount();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/sqlite|500|Internal/);
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal());
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /My journal/ })).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("has no automatic accessibility violations, with entries and a waiting month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()], due: [NOV] }));
    const { container } = mount();
    await screen.findByRole("heading", { level: 3, name: "November 2026" });
    expect((await axe(container)).violations).toEqual([]);
  });

  it("has no violations when empty", async () => {
    const { container } = mount();
    await screen.findByRole("region", { name: "Nothing written down yet" });
    expect((await axe(container)).violations).toEqual([]);
  });

  it("every control can be used with the keyboard", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ entries: [makeJournalMonth()] }));
    const { user } = mount();
    await screen.findByRole("heading", { level: 3, name: "November 2026" });
    screen.getByRole("button", { name: "Edit November 2026" }).focus();
    await user.keyboard("{Enter}");
    expect((screen.getByLabelText("Which month?") as HTMLSelectElement).value).toBe("2026-11");
  });
});

describe("the prompt on Today", () => {
  beforeEach(() => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday());
    vi.mocked(api.getTodayNote).mockResolvedValue(makeToday().note!);
  });

  it("says last month is missing, and links to the journal on that month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [NOV] }));
    mount("/today");
    const link = await screen.findByRole("link", { name: "Write it down" });
    expect(link.getAttribute("href")).toBe("/journal?month=2026-11");
    expect(screen.getByText("Last month isn't in your journal yet.")).toBeTruthy();
  });

  it("can be dismissed, and then stays away for that month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [NOV] }));
    const first = mount("/today");
    await first.user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
    first.unmount();
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(api.getJournal).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
  });

  it("only mentions last month, never an older one", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [{ month: "2026-10", month_label: "October 2026" }] }));
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
  });

  it("says nothing when no month is waiting", async () => {
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/in your journal yet/)).toBeNull();
  });

  it("says nothing, and still works, when the journal cannot be read", async () => {
    vi.mocked(api.getJournal).mockRejectedValue(new Error("down"));
    mount("/today");
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText(/in your journal yet/)).toBeNull();
  });

  it("always has a link to the journal", async () => {
    mount("/today");
    expect((await screen.findByRole("link", { name: "My journal" })).getAttribute("href")).toBe("/journal");
  });
});
