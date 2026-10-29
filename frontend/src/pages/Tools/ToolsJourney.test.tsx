import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { App } from "../../App";
import { UndoProvider } from "../../components/UndoProvider";
import { rememberBusiness } from "../../lib/session";
vi.mock("../../api", async original => ({ ...await original<typeof import("../../api")>(), listBusinesses: vi.fn(), listIndustries: vi.fn(), getBusiness: vi.fn(), calculateSalesNeeded: vi.fn() }));
vi.mock("../../lib/events", () => ({ track: vi.fn() }));
const BUSINESS: api.BusinessOut = { id: 1, name: "My shop", industry: "cafe", currency: "GBP", is_sample: false, setup_source: "full", baseline: null, created_at: "x" };
beforeEach(() => {
  vi.resetAllMocks(); window.sessionStorage.clear(); window.localStorage.clear();
  vi.mocked(api.listBusinesses).mockResolvedValue([BUSINESS]); vi.mocked(api.listIndustries).mockResolvedValue([]); vi.mocked(api.getBusiness).mockResolvedValue(BUSINESS);
});
function mount(path = "/") { render(<MemoryRouter initialEntries={[path]}><UndoProvider><App /></UndoProvider></MemoryRouter>); return userEvent.setup(); }
describe("Tools in the existing navigation", () => {
  it.each([true, false])("opens a working tool from the homepage, selected business: %s", async chosen => {
    if (chosen) rememberBusiness(1);
    const user = mount();
    await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Tools" }));
    expect(await screen.findByRole("heading", { level: 1, name: "How much do I need to sell?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tools" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "How much do I need to sell?" })).toBeNull();
    if (chosen) expect(await screen.findByLabelText("Selling price for one sale (GBP)")).toHaveProperty("value", "");
    else expect(screen.getByLabelText("Choose your currency")).toHaveProperty("value", "");
    expect(api.calculateSalesNeeded).not.toHaveBeenCalled();
  });
  it("lets someone without a business return from a direct Tools link", async () => {
    const user = mount("/tools");
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("heading", { name: /Big idea/ })).toBeTruthy();
  });
});
