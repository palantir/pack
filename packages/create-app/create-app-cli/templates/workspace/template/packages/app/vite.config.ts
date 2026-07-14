import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.DEV_SERVER_PORT ?? 5173),
    proxy: {
      "^(/api/v2)": {
        target: process.env.VITE_FOUNDRY_API_URL,
        changeOrigin: true,
        secure: true,
        ws: true,
      },
    },
  },
  resolve: {
    dedupe: ["@osdk/client", "@osdk/api"],
  },
});
