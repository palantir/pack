// Vitest setup file
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Not automatic here: this package does not enable Vitest globals, so Testing Library's own
// auto-cleanup never registers. Without it a mounted tree leaks into the next test and queries
// match elements rendered by an earlier one.
afterEach(() => {
  cleanup();
});
