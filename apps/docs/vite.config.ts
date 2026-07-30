import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kiorly-docs": path.resolve(__dirname, "../../Docs"),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    port: 4175,
    strictPort: true,
  },
});
