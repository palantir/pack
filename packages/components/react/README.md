# @palantir/pack.components.react

Reusable React components for building PACK applications.

## Overview

This package holds presentational React components and the thin hooks that drive them. It is
intentionally separate from `@palantir/pack.state.react`, which provides state hooks — that package
has no UI concerns and should not gain any.

## Usage

Example:

```tsx
import { useChannelErrorToasts } from "@palantir/pack.components.react";

function DocumentErrorToasts({ app, docRef, toaster }) {
  useChannelErrorToasts({ app, docRef, toaster });
  return null;
}
```

## Conventions

- Each component owns one folder, `src/<componentName>/`, re-exported from `src/index.ts`. A
  component's dependency-free layer is `Base<Name>`.
- Tests live in `src/__tests__/*.test.tsx` and run under `happy-dom` via `@testing-library/react`.
- `react` and `@types/react` are peer dependencies; do not add them as direct dependencies.
- **Exported symbols need explicit return types.** `transpileTypes` uses `oxc-transform`'s isolated
  declarations, which cannot infer them.

## Styling: no stylesheets

The build (`monorepo-transpile`) emits JS and types only, and the `exports` map has no CSS entry, so
a `.css` / `.module.css` file would never reach consumers. Components therefore use **inline
`style` objects**. Shipping real stylesheets requires extending the build and the exports map first.
This will be done in the future when more components are supported.

## Peer dependencies

`react` and `@types/react`, both `^17 || ^18 || ^19`. Nothing else.

**No UI component library is a dependency of this package**, declared or otherwise. Where a component
needs to drive one — a portal host, an overlay, an imperative UI service — it accepts the smallest
structural interface that does the job, so whatever library the consumer already uses satisfies it
without this package naming it.
