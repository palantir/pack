import { PackAppProvider } from "@palantir/pack.state.react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { app } from "./packApp.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PackAppProvider value={app}>
      <App />
    </PackAppProvider>
  </StrictMode>,
);
