import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      exclude: [
        "**/node_modules/**",
        "build/**",
        "coverage/**",
        "dist/**",
        "packages/docs/**",
        "test-output/**",
        "vitest.config.mjs",
      ],
    },
  },
});
