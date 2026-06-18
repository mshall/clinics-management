/**
 * PID 1 for App Runner: bind PORT immediately (minimal cold start), then spawn docker-boot.mjs.
 * App Runner health-checks :3000 from the first second; a tiny listener avoids ~40s rollbacks
 * while the full boot script loads AWS SDK / runs prisma migrate.
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPort = Number(process.env.PORT ?? "3000");
const upstreamPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");

// stdout — App Runner application logs prefer stdout over stderr when observability is enabled
console.log("[boot] health-listener starting pid=", process.pid);

function normalizeHealthPath(url) {
  const raw = url?.split("?")[0] ?? "";
  if (raw === "/api/v1/health/live" || raw === "/api/v1/health/live/") return "/api/v1/health/live";
  return raw.replace(/\/+$/, "") || "/";
}

function isAppRunnerLiveProbe(req) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const probePath = normalizeHealthPath(req.url);
  if (probePath === "/api/v1/health/live") return true;
  // App Runner may probe "/" on image/env updates even when HealthCheck Path is configured.
  if (probePath === "/" || probePath === "/health") return true;
  return false;
}

function respondLive(res, req) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify({ status: "ok", phase: "starting" }));
}

const server = createServer((req, res) => {
  if (isAppRunnerLiveProbe(req)) {
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
    if (isAppRunnerLiveProbe(req)) {
      respondLive(res, req);
      return;
    }
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "starting" }));
  });
  if (req.method === "GET" || req.method === "HEAD") upstreamReq.end();
  else req.pipe(upstreamReq);
});

async function listenOnPort() {
  await new Promise((resolve, reject) => {
    server.listen(publicPort, "0.0.0.0", () => {
      console.log("[boot] health listener listening on", publicPort);
      resolve();
    });
    server.on("error", reject);
  });
}

async function main() {
  await listenOnPort();

  const bootScript = path.join(__dirname, "docker-boot.mjs");
  const bootChild = spawn(process.execPath, [bootScript], { stdio: "inherit", env: process.env });
  bootChild.on("error", (err) => {
    console.error("[boot] docker-boot spawn error:", err?.message ?? err);
  });
  bootChild.on("exit", (code, signal) => {
    console.log(
      "[boot] docker-boot exited code=",
      code,
      "signal=",
      signal,
      "— health listener stays on",
      publicPort,
    );
  });
}

main().catch((err) => {
  console.error("[boot] health-listener fatal:", err?.message ?? err);
  process.exit(1);
});
