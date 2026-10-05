import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { App } from "./App";
import { getRememberedBusinessId } from "./lib/session";
import { makeToday } from "./test-fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual, listIndustries: vi.fn(), listBusinesses: vi.fn(), getToday: vi.fn(), getTodayNote: vi.fn(), deleteBusiness: vi.fn(),
    restoreBusiness: vi.fn(), getBusinessImpact: vi.fn(),
  };
});
vi.mock("./lib/events", () => ({ track: vi.fn() }));
vi.mock("./pages/Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));

const EXISTING: api.BusinessOut[] = ["My café", "Demo Cafe"].map((name, i) => ({
  id: i + 1, name, industry: "cafe", currency: "USD", created_at: "2026-10-03", setup_source: "full", is_sample: false, baseline: null,
}));

function open(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  vi.mocked(api.listIndustries).mockResolvedValue([]);
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 1, runs: 1 });
  vi.mocked(api.listBusinesses).mockResolvedValue(EXISTING);
  vi.mocked(api.getToday).mockResolvedValue(makeToday());
});

describe("a first visit always begins at the start screen", () => {
  for (const path of ["/", "/today"]) {
    it(`${path} with nothing chosen goes to the start screen, even though businesses exist`, async () => {
      open(path);
      expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
      expect(api.getToday).not.toHaveBeenCalled(); // no business was opened, not even the first one
      expect(getRememberedBusinessId()).toBeNull();
      expect(screen.queryByText(/Today at/)).toBeNull();
    });
  }

  it("lists the existing businesses, but only as choices", async () => {
    open("/");
    expect(await screen.findByRole("button", { name: "Continue with My café" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Demo Cafe" })).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });

  it("nothing is created on the way (no sample, no business)", async () => {
    const created = vi.spyOn(globalThis, "fetch");
    open("/");
    await screen.findByRole("heading", { name: "What kind of business do you run?" });
    const posts = created.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(posts).toEqual([]);
    created.mockRestore();
  });

  it("the Today link in the menu also lands on the start screen when nothing is chosen", async () => {
    const user = open("/compare");
    await user.click(await screen.findByRole("link", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
    expect(api.getToday).not.toHaveBeenCalled();
  });
});

describe("after the owner chooses", () => {
  it("picking from My businesses opens that business, and / then goes to Today", async () => {
    const user = open("/");
    await user.click(await screen.findByRole("button", { name: "Continue with Demo Cafe" }));
    expect(await screen.findByRole("heading", { name: /Today at/ })).toBeTruthy();
    expect(api.getToday).toHaveBeenCalledWith(2);
  });
});


describe("getting back to the front page", () => {
  async function openToday() {
    vi.mocked(api.getToday).mockResolvedValue(makeToday({ business_id: 2, name: "Demo Cafe" }));
    const user = open("/");
    await user.click(await screen.findByRole("button", { name: "Continue with Demo Cafe" }));
    await screen.findByRole("heading", { name: /Today at/ });
    return user;
  }

  it("the title in the header always shows the start screen, even with a business open", async () => {
    const user = await openToday();
    await user.click(screen.getByRole("link", { name: "Business Time Machine" }));
    expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
    expect(api.deleteBusiness).not.toHaveBeenCalled(); // looking at the start screen changes nothing
    expect(getRememberedBusinessId()).toBe(2);
  });

  it("the header shows which business is open", async () => {
    await openToday();
    expect(await screen.findByRole("button", { name: /Demo Cafe/ })).toBeTruthy();
  });

  it("deleting the open business from the header leads to the start screen, which still works", async () => {
    vi.mocked(api.deleteBusiness).mockResolvedValue({ id: 2, kind: "business", name: "Demo Cafe", deleted_at: "x" });
    vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 1, runs: 1 });
    const user = await openToday();
    await user.click(await screen.findByRole("button", { name: /Demo Cafe/ }));
    vi.mocked(api.listBusinesses).mockResolvedValue([EXISTING[0]]);
    await user.click(screen.getByRole("button", { name: "Delete Demo Cafe" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
    expect(getRememberedBusinessId()).toBeNull();
    expect(await screen.findByRole("button", { name: "Continue with My café" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Demo Cafe" })).toBeNull();
    expect(screen.getByRole("button", { name: /Choose a business/ })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "What kind of business do you run?" })).toBeTruthy();
  });
});
