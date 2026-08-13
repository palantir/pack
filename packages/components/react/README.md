# @palantir/pack.components.react

Reusable React components for building PACK applications.

## Overview

This package holds presentational React components and the thin hooks that drive them. It is
intentionally separate from `@palantir/pack.state.react`, which provides state hooks — that package
has no UI concerns and should not gain any.

## Usage

## Conventions

- Components live in `src/<componentName>/`, re-exported from `src/index.ts`.
- Tests live in `src/__tests__/*.test.tsx` and run under `happy-dom` via `@testing-library/react`.
- `react` is a peer dependency (`^17 || ^18 || ^19`); do not add it as a direct dependency.
- **Exported symbols need explicit return types.** `transpileTypes` uses `oxc-transform`'s isolated
  declarations, which cannot infer them.

## Styling: no stylesheets

The build (`monorepo-transpile`) emits JS and types only, and the `exports` map has no CSS entry, so
a `.css` / `.module.css` file would never reach consumers. Components therefore use **inline
`style` objects**. Shipping real stylesheets requires extending the build and the exports map first.

## Peer dependencies

`@blueprintjs/core` is an **optional** peer dependency. It is used for types only —
`useStatusErrorToast` takes a `Toaster` you construct, and nothing here imports Blueprint at
runtime. Components that do not touch a toaster work without Blueprint installed.
