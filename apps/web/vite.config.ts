import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function loadBuildId(): string {
  const idFile = path.resolve(__dirname, ".build-id");
  if (existsSync(idFile)) return readFileSync(idFile, "utf8").trim();
  return "dev-local";
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(loadBuildId()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: "/login",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
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
