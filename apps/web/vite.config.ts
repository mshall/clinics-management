import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: "/login",
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === "function") {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  statusCode: 503,
                  message:
                    "Local API is not reachable. From the repo root run npm run dev and wait for API listening on port 3000.",
                  error: "ApiUnavailable",
                }),
              );
            }
          });
        },
      },
    },
  },
});
