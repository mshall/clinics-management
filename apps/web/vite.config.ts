import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function loadBuildId(): string {
  const idFile = path.resolve(import.meta.dirname, ".build-id");
  if (existsSync(idFile)) return readFileSync(idFile, "utf8").trim();
  return "dev-local";
}

function loadBuildBuiltAt(): string {
  const atFile = path.resolve(import.meta.dirname, ".build-built-at");
  if (existsSync(atFile)) return readFileSync(atFile, "utf8").trim();
  return new Date(0).toISOString();
}

function apiProxyConfigure(proxy: {
  on: (
    event: "error",
    handler: (
      err: Error,
      req: unknown,
      res: { headersSent?: boolean; writeHead?: (code: number, headers: Record<string, string>) => void; end: (body: string) => void },
    ) => void,
  ) => void;
}) {
  proxy.on("error", (_err, _req, res) => {
    if (res && !res.headersSent && typeof res.writeHead === "function") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          statusCode: 503,
          message:
            "Local API is not reachable. From the repo root run npm run dev and wait for API listening on port 3010.",
          error: "ApiUnavailable",
        }),
      );
    }
  });
}

const apiDevProxy = {
  "/api": {
    target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3010",
    changeOrigin: true,
    // KNED: forward the original Host (x-forwarded-host) so nurse.localhost selects the Nurse edition on sign-in surfaces.
    xfwd: true,
    // Org full-backup downloads can be large; do not cut the proxy mid-stream.
    timeout: 0,
    proxyTimeout: 0,
    configure: apiProxyConfigure,
  },
} as const;

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(loadBuildId()),
    "import.meta.env.VITE_BUILD_BUILT_AT": JSON.stringify(loadBuildBuiltAt()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg", "favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Kiorly Clinic by Kiorex",
        short_name: "Kiorly",
        description: "Kiorly clinic management — اليوم / Today",
        lang: "en",
        theme_color: "#3730A3",
        background_color: "#F4F6FC",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/v1/dashboards/today") ||
              url.pathname.startsWith("/api/v1/appointments") ||
              url.pathname.startsWith("/api/v1/patients"),
            handler: "NetworkFirst",
            options: {
              cacheName: "kiorly-today-offline",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("react-router")) {
            return "vendor-react";
          }
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("i18next") || id.includes("react-i18next")) return "vendor-i18n";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    open: "/login",
    proxy: apiDevProxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: apiDevProxy,
  },
});
