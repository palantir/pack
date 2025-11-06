export default {
  "**/*.{js,ts,jsx,tsx,json,md}": (filenames) => [
    "turbo lint:fix --force --filter=[HEAD^1]",
    `cspell --quiet --no-must-find-files --file ${filenames.join(" ")}`,
  ],
  "**/{package.json,tsconfig.json,vitest.config.mjs,.monorepolint.config.mjs}": () => "turbo mrl:check --force",
}
