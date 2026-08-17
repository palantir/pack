# @palantir/pack.components.react

Reusable React components for building PACK applications.

## Overview

This package holds React components and the thin hooks that drive them. It is intentionally separate
from `@palantir/pack.state.react`, which provides state hooks — that package has no UI concerns and
should not gain any.

Components are **drop-in**: mount one and pass it data. A component never asks the consumer to supply
UI machinery, install a component library, or import a stylesheet.

## Usage

```tsx
import { ChannelErrorToasts } from "@palantir/pack.components.react";

function CanvasPage({ app, docRef }) {
  return (
    <>
      <ChannelErrorToasts app={app} docRef={docRef} />
      {/* ...the rest of the page */}
    </>
  );
}
```

`ChannelErrorToasts` shows a dismissible toast for each error reported by one of a document's four
channels (data, metadata, presence, activity). A repeated identical error gets one toast. A toast
stays up after its channel recovers, until the user dismisses it. A channel that recovers and fails
again gets a new toast. Changing document clears the stack.

## Architecture

Modeled on `@osdk/react-components`:

- **`src/base-components/<name>/`** — internal UI primitives, each wrapping a `@base-ui/react`
  subpath. Base UI supplies behavior and accessibility (focus, keyboard, live-region announcement,
  swipe-dismiss) without imposing any visual design. These are **not** exported.
- **`src/<componentName>/`** — one folder per public component. Data plumbing lives in a hook so the
  logic can be reused headless; the component is markup plus the hook.
- Pure domain logic (copy mapping, id derivation) lives in React-free modules so it can be tested
  without rendering.

## Conventions

- Props interfaces are declared in the file of the component they belong to.
- Tests live in `src/__tests__/*.test.tsx`, one file per source file, under `happy-dom` via
  `@testing-library/react`.
- `react`, `react-dom`, and `@types/react` are peer dependencies; do not add them as direct
  dependencies.
- **Exported symbols need explicit return types.** `transpileTypes` uses `oxc-transform`'s isolated
  declarations, which cannot infer them.

## Styling: no stylesheets yet

`monorepo-transpile` emits JS and types only and the `exports` map has no CSS entry, so a `.css` /
`.module.css` file would never reach consumers. Components therefore use inline `style` objects, with
every value behind a `var(--pack-*, <fallback>)` so consumers can still theme by setting those
properties on an ancestor.

Three consequences worth knowing:

- **No entry/exit animation.** Base UI drives transitions off `data-starting-style` /
  `data-ending-style` attributes, which need real stylesheets.
- **`:hover` / `:focus-visible` are emulated with React state** rather than CSS.
- **Toasts past the limit cannot be animated out** — they stay mounted and `inert`.

Adding a CSS pipeline (postcss, `.module.css`, a design-token layer, a `./styles.css` export) would
lift all three. It is deliberately deferred: pack has no design-token system today, and giving it one
is a larger piece of work than any single component. The swap is mechanical when it happens —
replace each `style={STYLES.x}` with `className={styles.x}` and move the values across.

## Dependencies

`@base-ui/react` is a direct dependency. It is unstyled behavior, not a component library, so it
imposes no design on consumers — the same reason `@osdk/react-components` depends on it.

**No component library is a peer dependency, and Blueprint is not referenced anywhere.** A consumer on
Blueprint, sonner, react-hot-toast, or nothing at all is unaffected.

Peers are `react`, `react-dom`, and `@types/react`, all `^17 || ^18 || ^19`.
