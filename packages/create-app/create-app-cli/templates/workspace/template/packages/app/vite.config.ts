import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.DEV_SERVER_PORT ?? 5173),
  },
  resolve: {
    dedupe: ["@osdk/client", "@osdk/api"],
  },
});
