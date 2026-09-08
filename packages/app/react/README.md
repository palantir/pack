# @palantir/pack.app.react

React context utilities for PACK applications.

## Usage

Create a typed provider and hook next to the configured app. This preserves accessors added by
`.withState()` for example, instead of narrowing the app back to the base `PackApp` type.

```typescript
import { initPackApp } from "@palantir/pack.app";
import { createPackAppContext } from "@palantir/pack.app.react";

export const app = initPackApp(client, options).withState().build();
export const { PackAppProvider, usePackApp } = createPackAppContext(app);
```

If the app is created asynchronously, create the typed context first and pass the finished app to
the provider:

```tsx
async function initializePackApp() {
  // await any required setup
  return initPackApp(client, options).withState().build();
}

type App = Awaited<ReturnType<typeof initializePackApp>>;

export const { PackAppProvider, usePackApp } = createPackAppContext<App>();

const app = await initializePackApp();

<PackAppProvider value={app}>
  <App />
</PackAppProvider>;
```
