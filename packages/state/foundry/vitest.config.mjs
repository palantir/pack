import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { coverageConfigDefaults, defaultExclude, defineProject } from "vitest/config";

// Vitest ignores tsconfig `paths`, so point the generated platform SDK imports
// (e.g. "@osdk/foundry.pack") at src/generated the same way.
const generatedDir = fileURLToPath(new URL("./src/generated/", import.meta.url));
const { paths } = JSON.parse(
  readFileSync(`${generatedDir}tsconfig.paths.json`, "utf-8"),
).compilerOptions;
const alias = Object.entries(paths)
  // Longest pattern first, so "@osdk/foundry.pack/v2/*" wins over "@osdk/foundry.pack/*".
  .sort(([a], [b]) => b.length - a.length)
  .map(([pattern, [target]]) => ({
    find: new RegExp(`^${pattern.replaceAll(".", "\\.").replace("*", "(.*)")}$`),
    replacement: `${generatedDir}${target.replace("./", "").replace("*", "$1")}`,
  }));

export default defineProject({
  resolve: { alias },
  test: {
    exclude: [...defaultExclude, "**/build/**", "**/test-output/**"],
    coverage: {
      provider: "v8",
      all: true,
      enabled: true,
      pool: "forks",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/*.test.{ts,tsx}",
        "**/__tests__",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "src/generated/**",
        "src/index.ts",
        "test-output",
        "vitest.config.*",
      ],
    },
  },
});
