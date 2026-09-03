---
"@palantir/pack.state.core": minor
"@palantir/pack.state.react": minor
"@palantir/pack.auth": minor
"@palantir/pack.app": minor
---

Declare the `auth` and `state` module accessors on `PackApp`, so consumers no longer need to
cast the result of `usePackApp()` to reach `app.state` / `app.auth`.

`pack.state.core` and `pack.auth` now augment the `PackApp` interface, and `initPackApp` always
initializes the state module so the declaration is accurate. `withState()` is now a no-op and is
deprecated, as are `WithStateModule<T>` and `PackAppWithAuth`; all three remain exported and
can be removed from builder chains and type annotations at your convenience.

Note: the state module (and therefore the document service) is now constructed during
`initPackApp` rather than on `.withState()`. Constructing it performs no network I/O, but in
demo mode it opens the local IndexedDB store slightly earlier than before.

Also fixes the `usePackApp` overloads, where `throwOnMissing: true` was incorrectly typed as
returning `PackApp | null` and `false` was not accepted at all.
