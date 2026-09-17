# @palantir/pack.codegen.core

## 0.29.0

### Minor Changes

- f854a63: Allow create-pack-app to use templates from local folders or installed npm packages. Templates can run a repository's package creator before adding files, skip the generator's npm install, and print their own setup instructions.

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

### Minor Changes

- 194de87: Modernize the interactive prompt layer: `promptUser` now uses `@inquirer/prompts`
  instead of the legacy `inquirer` object API. The `PromptQuestion` `type` union
  renames `"list"` to `"select"` to match the current inquirer prompt names (the old
  `"list"` type no longer rendered its choices under inquirer v13). Template configs
  and CLIs should use `type: "select"` for choice prompts.

## 0.2.0

### Minor Changes

- c0de07f: Add `@palantir/pack.codegen.core`, a shared template-driven code generation engine
  extracted from `@palantir/pack.sdkgen`, and refactor `@palantir/pack.sdkgen` to consume
  it. The public API of `@palantir/pack.sdkgen` is unchanged.
