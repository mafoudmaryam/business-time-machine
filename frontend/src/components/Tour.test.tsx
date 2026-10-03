import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as events from "../lib/events";
import { tourSeen } from "../lib/session";
import { TOUR_STEPS } from "../lib/tourSteps";
import { Tour } from "./Tour";

vi.mock("../lib/events", () => ({ track: vi.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(events.track).mockClear();
});

describe("Tour", () => {
  it("has three short steps", () => {
    expect(TOUR_STEPS).toHaveLength(3);
    for (const s of TOUR_STEPS) expect(s.text.split(" ").length).toBeLessThan(45);
  });

  it("walks through the steps with Next and Back", async () => {
    const user = userEvent.setup();
    render(<Tour onClose={() => undefined} />);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByText("Try a change")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("finishing on the last step remembers it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Tour onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalled();
    expect(tourSeen()).toBe(true);
    expect(events.track).toHaveBeenCalledWith("tour_done", "today", { step: 3 });
  });

  it("can be skipped at any time, with the button or Esc, and is remembered too", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Tour onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tourSeen()).toBe(true);
    expect(events.track).toHaveBeenCalledWith("tour_skip", "today", { step: 1 });

    window.localStorage.clear();
    render(<Tour onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(tourSeen()).toBe(true);
  });
});
