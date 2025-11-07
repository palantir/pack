export default {
  "**/*.{js,ts,jsx,tsx,json,md}": () => [
    "turbo lint:fix --force --filter=[HEAD^1]",
  ],
  "*": (filenames) => `cspell --quiet --no-must-find-files ${filenames.join(" ")}`,
  "**/{package.json,tsconfig.json,vitest.config.mjs,.monorepolint.config.mjs}": () => "turbo mrl:check --force",
}
