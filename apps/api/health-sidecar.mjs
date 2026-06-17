/**
 * Minimal liveness listener on PORT — started before docker-boot.mjs so App Runner
 * gets HTTP 200 within seconds even while Nest/migrate are still starting.
 */
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? "3000");

function isLive(req) {
  const method = req.method ?? "GET";
  const raw = req.url?.split("?")[0] ?? "";
  const path = raw === "/api/v1/health/live/" ? "/api/v1/health/live" : raw.replace(/\/+$/, "") || "/";
  return (method === "GET" || method === "HEAD") && path === "/api/v1/health/live";
}

createServer((req, res) => {
  if (isLive(req)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(JSON.stringify({ status: "ok", phase: "starting" }));
    return;
  }
  res.statusCode = 503;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ status: "starting" }));
}).listen(port, "0.0.0.0", () => {
  console.error("[boot] health sidecar listening on", port);
});
