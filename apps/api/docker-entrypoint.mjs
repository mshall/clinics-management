/**
 * App Runner PID 1: bind PORT synchronously (no async gap), answer all deploy probe paths,
 * then spawn docker-boot.mjs for secret fetch, migrate, and Nest on NEST_INTERNAL_PORT.
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPort = Number(process.env.PORT ?? "3000");
const upstreamPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");

process.stderr.write(`[boot] entrypoint pid=${process.pid}\n`);

function normalizeHealthPath(url) {
  const raw = url?.split("?")[0] ?? "";
  if (raw === "/api/v1/health/live" || raw === "/api/v1/health/live/") return "/api/v1/health/live";
  if (raw === "/health/live" || raw === "/health/live/") return "/health/live";
  return raw.replace(/\/+$/, "") || "/";
}

function isLiveProbe(req) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const probePath = normalizeHealthPath(req.url);
  if (probePath === "/api/v1/health/live" || probePath === "/health/live") return true;
  // App Runner deploy probes vary during image/env rollouts even when HealthCheck Path is set.
  if (probePath === "/" || probePath === "/health") return true;
  return false;
}

function respondLive(res, req) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Connection", "close");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify({ status: "ok" }));
}

const server = createServer((req, res) => {
  if (isLiveProbe(req)) {
    respondLive(res, req);
    return;
  }
  const upstreamReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${upstreamPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on("error", () => {
    if (res.headersSent) return;
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "starting" }));
  });
  if (req.method === "GET" || req.method === "HEAD") upstreamReq.end();
  else req.pipe(upstreamReq);
});

server.listen(publicPort, "0.0.0.0", () => {
  process.stderr.write(`[boot] listening on ${publicPort}\n`);
});

server.on("error", (err) => {
  console.error("[boot] health listener error:", err?.message ?? err);
});

const bootScript = path.join(__dirname, "docker-boot.mjs");
const bootChild = spawn(process.execPath, [bootScript], { stdio: "inherit", env: process.env });
bootChild.on("error", (err) => {
  console.error("[boot] docker-boot spawn error:", err?.message ?? err);
});
bootChild.on("exit", (code, signal) => {
  console.error("[boot] docker-boot exited code=", code, "signal=", signal, "— health listener stays on", publicPort);
});
