---
"@palantir/pack.codegen.core": minor
---

Modernize the interactive prompt layer: `promptUser` now uses `@inquirer/prompts`
instead of the legacy `inquirer` object API. The `PromptQuestion` `type` union
renames `"list"` to `"select"` to match the current inquirer prompt names (the old
`"list"` type no longer rendered its choices under inquirer v13). Template configs
and CLIs should use `type: "select"` for choice prompts.
