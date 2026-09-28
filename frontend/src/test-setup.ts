import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// This project imports test globals explicitly rather than enabling
// vitest's `globals: true`, so @testing-library/react's automatic
// afterEach(cleanup) (which detects a global afterEach) never registers.
// Without this, unmounted DOM nodes from earlier tests in the same file
// stick around and can be matched by later queries.
afterEach(() => {
  cleanup();
});
