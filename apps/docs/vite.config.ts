import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kiorly-docs": path.resolve(import.meta.dirname, "../../Docs"),
    },
  },
  server: {
    port: Number(process.env.DOCS_PORT ?? 5175),
    strictPort: true,
    host: true,
  },
  preview: {
    port: Number(process.env.DOCS_PREVIEW_PORT ?? 4175),
    strictPort: true,
    host: true,
  },
});
