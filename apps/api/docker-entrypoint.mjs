/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON when DB_SECRET_ARN is set,
 * runs Prisma migrate, then starts Nest behind a port-3000 boot proxy.
 *
 * App Runner health-checks :3000 for the entire boot window. The proxy MUST
 * listen on PORT before any VPC/Secrets Manager work — otherwise App Runner sees
 * connection refused and rolls back in ~40s (matching DB secret retry backoff).
 *
 * Demo seed runs via post-deploy DbSeedFn Lambda (not on App Runner boot).
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.error("[boot] entrypoint loaded");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** CDK sets *HOST only (vpce-….vpce.amazonaws.com); SDK needs https URL. */
function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

function normalizeHealthPath(url) {
  const raw = url?.split("?")[0] ?? "";
  if (raw === "/api/v1/health/live" || raw === "/api/v1/health/live/") return "/api/v1/health/live";
  return raw.replace(/\/+$/, "") || "/";
}

async function listenServer(server, port, label) {
  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.error(`[boot] ${label} listening on`, port);
      resolve();
    });
    server.on("error", reject);
  });
}

function isAppRunnerLiveProbe(req) {
  const method = req.method ?? "GET";
  return (method === "GET" || method === "HEAD") && normalizeHealthPath(req.url) === "/api/v1/health/live";
}

function respondBoot(res, req) {
  const live = isAppRunnerLiveProbe(req);
  res.statusCode = live ? 200 : 503;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(live ? { status: "ok", phase: "starting" } : { status: "starting" }));
}

function createUpstreamProxy(upstreamPort) {
  return createServer((req, res) => {
    // App Runner liveness only — never forward (upstream may hang > health timeout during migrate/Nest boot).
    if (isAppRunnerLiveProbe(req)) {
      respondBoot(res, req);
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
    upstreamReq.on("error", () => respondBoot(res, req));
    req.pipe(upstreamReq);
  });
}

function runChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runMigrate() {
  let attempt = 0;
  while (true) {
    attempt++;
    console.error(`[boot] PRISMA_MIGRATE_ON_BOOT=true — prisma migrate deploy (attempt ${attempt}) …`);
    const exit = await runChild("prisma", ["migrate", "deploy"]);
    if (exit === 0) {
      console.error("[boot] prisma migrate deploy completed OK");
      return;
    }
    console.error("[boot] prisma migrate deploy failed with status", exit, "— retrying (proxy keeps /health/live)");
    await sleep(Math.min(30_000, 5000 * Math.min(attempt, 6)));
  }
}

async function runSeed() {
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — running idempotent seed …");
  const exit = await runChild("npx", ["tsx", seedScript]);
  if (exit !== 0) {
    console.error("[boot] seed failed with status", exit, "— continuing to start API");
  } else {
    console.error("[boot] seed completed OK");
  }
}

async function loadDbSecretFromArn(dbSecretArn) {
  const { GetSecretValueCommand, SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const client = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  if (smEndpoint) {
    console.error("[boot] Secrets Manager client using SECRETS_MANAGER_VPCE_HOST (VPC interface)");
  }
  // Keep retrying while :3000 proxy answers App Runner liveness — process.exit here caused
  // ~40s rollbacks when the 8-attempt budget expired during cold VPC endpoint warm-up.
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const dbPort = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) {
        throw new Error("DB secret JSON missing host/hostname/endpoint");
      }
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(dbPort), dbname);
      return;
    } catch (e) {
      console.error(`DB secret fetch attempt ${attempt} failed:`, e?.message ?? e);
      await sleep(Math.min(30_000, 750 * 2 ** Math.min(attempt - 1, 6)));
    }
  }
}

async function main() {
  const publicPort = Number(process.env.PORT ?? "3000");
  const internalPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");
  const migrateOnBoot = process.env.PRISMA_MIGRATE_ON_BOOT === "true";
  const seedOnBoot = process.env.PRISMA_SEED_ON_BOOT === "true";

  const proxy = createUpstreamProxy(internalPort);
  await listenServer(proxy, publicPort, "upstream proxy");

  const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
  const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
  const smEpForChild = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  if (smEpForChild) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEpForChild;
  if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
  if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

  const dbSecretArn = process.env.DB_SECRET_ARN;
  if (dbSecretArn) {
    await loadDbSecretFromArn(dbSecretArn);
  }

  if (migrateOnBoot) await runMigrate();
  if (seedOnBoot) await runSeed();

  const nestEnv = { ...process.env, PORT: String(internalPort) };
  const mainJs = path.join(__dirname, "dist", "main.js");
  let nestRestarts = 0;

  function spawnNest() {
    console.error("[boot] spawning Nest", mainJs, "internal PORT=", internalPort);
    const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });
    child.on("exit", (code, signal) => {
      if (code === 0 && !signal) {
        process.exit(0);
      }
      nestRestarts++;
      console.error(
        "[boot] Nest exited",
        "code=",
        code,
        "signal=",
        signal,
        "restart=",
        nestRestarts,
      );
      if (nestRestarts > 5) {
        console.error("[boot] Nest restart limit — proxy keeps /health/live for App Runner");
        return;
      }
      setTimeout(spawnNest, 2000);
    });
  }

  spawnNest();
}

main().catch((err) => {
  console.error("[boot] fatal:", err);
  process.exit(1);
});
