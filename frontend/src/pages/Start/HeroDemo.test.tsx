import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { createSampleBusiness, previewChange, type BusinessOut } from "../../api";
import { makeSketch } from "../../test-fixtures";
import { HeroDemo } from "./HeroDemo";

vi.mock("../../api", () => ({ createSampleBusiness: vi.fn(), previewChange: vi.fn() }));
const sample: BusinessOut = { id: 99, name: "Sample café", industry: "cafe", currency: "GBP", is_sample: true, baseline: null, setup_source: "sample", created_at: "2026-10-24" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createSampleBusiness).mockResolvedValue(sample);
  vi.mocked(previewChange).mockResolvedValue(makeSketch());
});

describe("the landing price demo", () => {
  it("waits for an explicit action, then displays the endpoint's figures in the sample currency", async () => {
    const open = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<HeroDemo currency="GBP" onOpen={open} />);
    expect(createSampleBusiness).not.toHaveBeenCalled();
    expect(previewChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "See what happens →" }));
    expect(createSampleBusiness).toHaveBeenCalledWith("cafe", "GBP");
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(99, { type: "price", amount: 7, start_month: 1 }, expect.any(AbortSignal)));
    expect(await screen.findByText("+£534", { exact: true })).toBeTruthy();
    expect(screen.getByText("A £6.50 order → £6.96")).toBeTruthy();
    expect(screen.getByText(/A made-up café/)).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: /Keep exploring this café/ }));
    expect(open).toHaveBeenCalledWith(sample);
  });

  it("shows the downside immediately and lets beginners reveal the extra figures", async () => {
    render(<HeroDemo currency="GBP" onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "See what happens →" }));
    await screen.findByText("+£534", { exact: true });
    expect(screen.getByText(/About 382 fewer visits/).closest("details")).toBeNull();
    const note = screen.getByRole("complementary", { name: "What these estimates depend on" });
    expect(note.closest("details")).toBeNull();
    expect(note.textContent).toContain("not a measured chance of real-world success");
    expect(screen.getByRole("heading", { name: "Money in the bank" }).closest("details")?.hasAttribute("open")).toBe(false);
    await userEvent.click(screen.getByText("What else could happen?"));
    expect(screen.getByRole("heading", { name: "Money in the bank" }).closest("details")?.hasAttribute("open")).toBe(true);
  });

  it("uses a selected price in the engine request and updates when the slider moves", async () => {
    render(<HeroDemo currency="GBP" onOpen={vi.fn()} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "See what happens →" }));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(99, { type: "price", amount: 10, start_month: 1 }, expect.any(AbortSignal)));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    await waitFor(() => expect(previewChange).toHaveBeenLastCalledWith(99, { type: "price", amount: 4, start_month: 1 }, expect.any(AbortSignal)));
    expect(createSampleBusiness).toHaveBeenCalledTimes(1);
  });

  it("allows a failed sample creation to be retried", async () => {
    vi.mocked(createSampleBusiness).mockRejectedValueOnce(new Error("offline"));
    render(<HeroDemo currency="GBP" onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "See what happens →" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The example couldn’t open. Try again.");
    expect(previewChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "See what happens →" }));
    expect(await screen.findByText("+£534", { exact: true })).toBeTruthy();
  });

  it("keeps the previous result and explains a failed slider update", async () => {
    render(<HeroDemo currency="GBP" onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "See what happens →" }));
    await screen.findByText("+£534", { exact: true });
    vi.mocked(previewChange).mockRejectedValueOnce(new Error("offline"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "9" } });
    expect(await screen.findByText(/We couldn’t update/)).toBeTruthy();
    expect(screen.getByText("+£534", { exact: true })).toBeTruthy();
  });
});
