import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PackAppProvider } from "./packApp.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PackAppProvider>
      <App />
    </PackAppProvider>
  </StrictMode>,
);
