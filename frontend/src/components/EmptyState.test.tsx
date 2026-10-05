import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadError } from "./LoadError";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("EmptyState", () => {
  it("says what is missing and gives one clear next step as a link", () => {
    wrap(
      <EmptyState title="No runs yet" action={{ label: "Try a change", to: "/try" }}>
        <p>A run is one full simulation.</p>
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "No runs yet" })).toBeTruthy();
    expect(screen.getByText("A run is one full simulation.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try a change" }).getAttribute("href")).toBe("/try");
  });

  it("can offer a quieter second option", () => {
    wrap(<EmptyState title="Nothing" action={{ label: "Do it", to: "/a" }} secondary={{ label: "Or this", to: "/b" }} />);
    expect(screen.getByRole("link", { name: "Do it" }).className).not.toContain("quiet");
    expect(screen.getByRole("link", { name: "Or this" }).className).toContain("quiet");
  });

  it("an action can also be a button", async () => {
    const onClick = vi.fn();
    wrap(<EmptyState title="Nothing" action={{ label: "Do it", onClick }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Do it" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("works without any action or text", () => {
    wrap(<EmptyState title="Just a title" />);
    expect(screen.getByRole("heading", { name: "Just a title" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("is a labelled region without accessibility problems", async () => {
    const { container } = wrap(<EmptyState title="No scenarios yet" action={{ label: "Try a change", to: "/try" }}><p>Text.</p></EmptyState>);
    expect(screen.getByRole("region", { name: "No scenarios yet" })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("LoadError", () => {
  it("says what could not load, with a Try again button that works, and hides the raw message", async () => {
    const onRetry = vi.fn();
    render(<LoadError message="Internal Server Error 500" what="your scenarios" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("We couldn't load your scenarios");
    expect(screen.getByRole("alert").textContent).not.toContain("500");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("when the program cannot be reached, says so calmly and says what to do", () => {
    render(<LoadError message="Could not reach the API. Is the backend running on http://localhost:8000?" what="your scenarios" onRetry={() => undefined} />);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("We can't reach the program that does the sums");
    expect(text).toContain("start.ps1");
    expect(text).not.toContain("localhost");
  });

  it("can offer another way out next to Try again", () => {
    render(<LoadError message="x" what="that" onRetry={() => undefined} extra={<button>Start fresh</button>} />);
    expect(screen.getByRole("button", { name: "Start fresh" })).toBeTruthy();
  });

  it("has no accessibility problems", async () => {
    const { container } = render(<LoadError message="x" what="your scenarios" onRetry={() => undefined} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("ErrorBoundary", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  function Boom(): never {
    throw new Error("secret stack trace");
  }

  it("shows a calm message with two ways out instead of a blank page", () => {
    wrap(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong on this page");
    expect(alert.textContent).not.toContain("secret stack trace");
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the start screen" }).getAttribute("href")).toBe("/");
  });

  it("shows the page normally when nothing breaks", () => {
    wrap(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All fine")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a new key (another page) clears it", () => {
    const { rerender } = wrap(
      <ErrorBoundary key="a">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(
      <MemoryRouter>
        <ErrorBoundary key="b">
          <p>Another page</p>
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText("Another page")).toBeTruthy();
  });
});
