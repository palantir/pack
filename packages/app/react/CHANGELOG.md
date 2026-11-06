# @palantir/pack.app.react

## 0.36.0

### Patch Changes

- @palantir/pack.core@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [f5c100e]
  - @palantir/pack.core@0.35.0

## 0.34.0

### Minor Changes

- 8810d4c: Fix imports of package subpaths, such as `@palantir/pack.core/generatedPlatformSdk`. The `"./*"` entry in each package's `exports` pointed at `build/js/public/*.js` and `build/cjs/public/*.js`, which the build never writes. It now points at `build/esm/public/*.js` and `build/cjs/public/*.cjs`.

### Patch Changes

- Updated dependencies [8810d4c]
- Updated dependencies [8810d4c]
  - @palantir/pack.core@0.34.0

## 0.33.0

### Patch Changes

- @palantir/pack.core@0.33.0

## 0.32.0

### Patch Changes

- @palantir/pack.core@0.32.0

## 0.31.0

### Patch Changes

- @palantir/pack.core@0.31.0

## 0.30.0

### Patch Changes

- @palantir/pack.core@0.30.0

## 0.29.0

### Patch Changes

- @palantir/pack.core@0.29.0

## 0.28.0

### Minor Changes

- 1754366: Move the Pack app React context APIs from `@palantir/pack.state.react` into the new
  `@palantir/pack.app.react` package. Update the workspace template to import the APIs from their new
  package.

### Patch Changes

- @palantir/pack.core@0.28.0
