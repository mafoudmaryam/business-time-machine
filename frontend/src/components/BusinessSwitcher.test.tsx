import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { getRememberedBusinessId, rememberBusiness } from "../lib/session";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { UndoProvider } from "./UndoProvider";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual, listBusinesses: vi.fn(), createSampleBusiness: vi.fn(), deleteBusiness: vi.fn(), restoreBusiness: vi.fn(),
    getBusinessImpact: vi.fn(),
  };
});
vi.mock("../lib/events", () => ({ track: vi.fn() }));

const biz = (id: number, name: string, over: Partial<api.BusinessOut> = {}): api.BusinessOut => ({
  id, name, industry: "cafe", currency: "USD", created_at: "2026-10-03", setup_source: "full", is_sample: false, baseline: null, ...over,
});
const LIST = [biz(1, "Demo Cafe"), biz(2, "Noah's"), biz(3, "Sample café", { is_sample: true, setup_source: "sample" })];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function mount() {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/compare"]}>
      <UndoProvider>
        <BusinessSwitcher />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(api.listBusinesses).mockResolvedValue(LIST);
  vi.mocked(api.createSampleBusiness).mockResolvedValue(biz(9, "Sample bakery", { industry: "bakery", is_sample: true }));
  vi.mocked(api.deleteBusiness).mockResolvedValue({ id: 2, kind: "business", name: "Noah's", deleted_at: "x" });
  vi.mocked(api.restoreBusiness).mockResolvedValue(biz(2, "Noah's"));
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 3, runs: 2 });
});

describe("the button", () => {
  it("shows the business you have open", async () => {
    rememberBusiness(2);
    mount();
    expect(await screen.findByRole("button", { name: /Noah's/ })).toBeTruthy();
  });

  it("says so when nothing is chosen", async () => {
    mount();
    expect(await screen.findByRole("button", { name: /Choose a business/ })).toBeTruthy();
  });

  it("is a disclosure: aria-expanded flips and the list appears", async () => {
    rememberBusiness(1);
    const { user } = mount();
    const button = await screen.findByRole("button", { name: /Demo Cafe/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Your businesses" })).toBeNull();
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "Your businesses" })).toBeTruthy();
  });
});

describe("the menu", () => {
  async function open() {
    rememberBusiness(1);
    const ctx = mount();
    await ctx.user.click(await screen.findByRole("button", { name: /Demo Cafe/ }));
    return { ...ctx, panel: within(screen.getByRole("group", { name: "Your businesses" })) };
  }

  it("lists every saved business, marks the open one, and labels samples", async () => {
    const { panel } = await open();
    for (const name of ["Demo Cafe", "Noah's", "Sample café"]) expect(panel.getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    expect(panel.getByRole("button", { name: /^Demo Cafe/ }).getAttribute("aria-current")).toBe("true");
    expect(panel.getByRole("button", { name: /^Noah's/ }).getAttribute("aria-current")).toBeNull();
    expect(panel.getAllByText("Sample business").length).toBeGreaterThanOrEqual(1);
  });

  it("switching picks that business and opens Today", async () => {
    const { user, panel } = await open();
    await user.click(panel.getByRole("button", { name: /^Noah's/ }));
    expect(getRememberedBusinessId()).toBe(2);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/today"));
    expect(screen.queryByRole("group", { name: "Your businesses" })).toBeNull();
  });

  it("New business goes to the start screen and changes nothing", async () => {
    const { user, panel } = await open();
    await user.click(panel.getByRole("button", { name: "New business" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
    expect(getRememberedBusinessId()).toBe(1); // still the same choice: the start screen only shows things
    expect(api.deleteBusiness).not.toHaveBeenCalled();
    expect(api.createSampleBusiness).not.toHaveBeenCalled();
  });

  it("Sample business makes one of the chosen kind and opens it", async () => {
    const { user, panel } = await open();
    const samples = panel.getByRole("group", { name: "Sample business" });
    await user.click(within(samples).getByRole("button", { name: "Bakery" }));
    expect(api.createSampleBusiness).toHaveBeenCalledWith("bakery", "USD");
    await waitFor(() => expect(getRememberedBusinessId()).toBe(9));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/today"));
  });

  it("a sample that cannot be made says so and stays", async () => {
    vi.mocked(api.createSampleBusiness).mockRejectedValue(new Error("Could not reach the API."));
    const { user, panel } = await open();
    await user.click(within(panel.getByRole("group", { name: "Sample business" })).getByRole("button", { name: "Café" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the API");
    expect(getRememberedBusinessId()).toBe(1);
  });

  it("shows a friendly line when there are none yet, and still offers new and sample", async () => {
    vi.mocked(api.listBusinesses).mockResolvedValue([]);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: /Choose a business/ }));
    expect(screen.getByText("No businesses yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New business" })).toBeTruthy();
  });
});

describe("keyboard", () => {
  it("opens with Enter, Tab reaches the choices, Esc closes and returns focus to the button", async () => {
    rememberBusiness(1);
    const { user } = mount();
    const button = await screen.findByRole("button", { name: /Demo Cafe/ });
    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await user.tab();
    expect(document.activeElement?.textContent).toContain("Demo Cafe");
    await user.tab();
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Delete Demo Cafe");
    await user.keyboard("{Escape}");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("Space also opens it", async () => {
    rememberBusiness(1);
    const { user } = mount();
    const button = await screen.findByRole("button", { name: /Demo Cafe/ });
    button.focus();
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking elsewhere closes it", async () => {
    rememberBusiness(1);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: /Demo Cafe/ }));
    await user.click(screen.getByTestId("where"));
    expect(screen.queryByRole("group", { name: "Your businesses" })).toBeNull();
  });

  it("has no automatic accessibility violations, open or closed", async () => {
    rememberBusiness(1);
    const { user, container } = mount();
    const button = await screen.findByRole("button", { name: /Demo Cafe/ });
    expect((await axe(container)).violations).toEqual([]);
    await user.click(button);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("deleting from the menu", () => {
  async function askToDelete(name: string) {
    const ctx = mount();
    await ctx.user.click(await screen.findByRole("button", { name: /Demo Cafe|Noah's|Choose/ }));
    await ctx.user.click(screen.getByRole("button", { name: `Delete ${name}` }));
    return ctx;
  }

  it("asks first, in plain words, and deletes nothing until you confirm", async () => {
    rememberBusiness(1);
    await askToDelete("Noah's");
    const box = await screen.findByRole("dialog", { name: "Delete “Noah's”?" });
    expect(await within(box).findByText(/all of its 3 scenarios and 2 saved runs/)).toBeTruthy();
    expect(api.deleteBusiness).not.toHaveBeenCalled();
  });

  it("deleting another business keeps you where you are", async () => {
    rememberBusiness(1);
    const { user } = await askToDelete("Noah's");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.deleteBusiness).toHaveBeenCalledWith(2);
    expect(getRememberedBusinessId()).toBe(1);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/compare"));
    expect(screen.getByRole("status").textContent).toContain("Deleted “Noah's”.");
  });

  it("deleting the open business forgets it and goes to the start screen", async () => {
    rememberBusiness(2);
    vi.mocked(api.deleteBusiness).mockResolvedValue({ id: 2, kind: "business", name: "Noah's", deleted_at: "x" });
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: /Noah's/ }));
    await user.click(screen.getByRole("button", { name: "Delete Noah's" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(getRememberedBusinessId()).toBeNull());
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
  });

  it("Undo after deleting the open business brings it back and opens it again", async () => {
    rememberBusiness(2);
    const { user } = mount();
    await user.click(await screen.findByRole("button", { name: /Noah's/ }));
    await user.click(screen.getByRole("button", { name: "Delete Noah's" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.restoreBusiness).toHaveBeenCalledWith(2);
    await waitFor(() => expect(getRememberedBusinessId()).toBe(2));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/today"));
  });
});
