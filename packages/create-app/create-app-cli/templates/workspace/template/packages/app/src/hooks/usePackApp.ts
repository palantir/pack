import { usePackApp as pack_usePackApp } from "@palantir/pack.state.react";
import type { app } from "../packApp.js";

// The library `usePackApp` returns the base `PackApp` type. This app builds its
// PackApp with `.withState()`, so cast to the concrete `app` type here to expose
// the state module (needed by hooks like `useSearchDocuments`).
export const usePackApp = pack_usePackApp as () => typeof app;
