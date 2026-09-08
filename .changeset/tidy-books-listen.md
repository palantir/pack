---
"@palantir/pack.create-app": patch
"@palantir/pack.state.react": minor
---

Add `createPackAppContext(app)`, which creates a React provider and hook bound to the exact
configured app type. State remains opt-in through `.withState()`, while state, auth, and named
module accessors now survive the React context without consumer casts.

The workspace template now uses the bound context and no longer generates a cast wrapper. This
also fixes the `usePackApp` overloads for required and optional providers.
