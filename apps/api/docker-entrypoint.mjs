/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON (host, port, username, password, dbname)
 * when DB_SECRET_ARN is set, optionally runs Prisma migrations, then starts the Nest app.
 *
 * App Runner health-checks PORT (3000) from the first second the container runs. Migrate/seed
 * and Nest cold start can take minutes, so a front HTTP server on PORT stays up for the whole
 * lifecycle and proxies to Nest on an internal port once it is listening.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** CDK sets *HOST only (vpce-….vpce.amazonaws.com); SDK needs https URL. */
function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  // Defensive: DnsEntry "HostedZoneId:dnsName" if a deploy path ever passes the pair as host only.
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

const publicPort = Number(process.env.PORT ?? "3000");
const nestPort = Number(process.env.NEST_INTERNAL_PORT ?? String(publicPort + 1));
let nestReady = false;

function proxyToNest(clientReq, clientRes) {
  const headers = { ...clientReq.headers, host: `127.0.0.1:${nestPort}` };
  const proxied = httpRequest(
    {
      hostname: "127.0.0.1",
      port: nestPort,
      method: clientReq.method,
      path: clientReq.url,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );
  proxied.on("error", (err) => {
    console.error("[boot] proxy error:", err?.message ?? err);
    if (!clientRes.headersSent) {
      clientRes.statusCode = 502;
      clientRes.setHeader("Content-Type", "application/json; charset=utf-8");
      clientRes.end(JSON.stringify({ status: "bad_gateway", phase: "proxy" }));
    } else {
      clientRes.end();
    }
  });
  clientReq.pipe(proxied);
}

function createFrontServer() {
  return createServer((req, res) => {
    const p = req.url?.split("?")[0] ?? "";
    const isLive = req.method === "GET" && p === "/api/v1/health/live";

    if (nestReady) {
      proxyToNest(req, res);
      return;
    }

    if (isLive) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ status: "ok", phase: "boot" }));
      return;
    }

    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "starting" }));
  });
}

async function listenFrontServer(server, port) {
  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.error("[boot] front health/proxy listening on", port, "(Nest internal port", nestPort + ")");
      resolve();
    });
    server.on("error", reject);
  });
}

async function waitForNestHealth(maxAttempts = 120, intervalMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await new Promise((resolve) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: nestPort,
          method: "GET",
          path: "/api/v1/health/live",
          timeout: 2_000,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
    });
    if (ok) {
      console.error("[boot] Nest health/live OK on internal port after", attempt, "attempt(s)");
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

const migrateOnBoot = process.env.PRISMA_MIGRATE_ON_BOOT === "true";
const seedOnBoot = process.env.PRISMA_SEED_ON_BOOT === "true";
const frontServer = createFrontServer();
await listenFrontServer(frontServer, publicPort);

const dbSecretArn = process.env.DB_SECRET_ARN;
if (dbSecretArn) {
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
  const maxAttempts = Number(process.env.DB_SECRET_FETCH_ATTEMPTS ?? "8");
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const port = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) {
        throw new Error("DB secret JSON missing host/hostname/endpoint");
      }
      // sslmode=no-verify: RDS may require TLS; slim images often lack RDS CA bundle (require would fail).
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${port}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(port), dbname);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      console.error(`DB secret fetch attempt ${attempt}/${maxAttempts} failed:`, e?.message ?? e);
      if (attempt < maxAttempts) {
        await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)));
      }
    }
  }
  if (lastErr && !process.env.DATABASE_URL) {
    console.error("Failed to load DB secret from Secrets Manager:", lastErr);
    process.exit(1);
  }
}

if (migrateOnBoot) {
  console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  const migrateExit = migrate.status ?? 1;
  if (migrateExit !== 0) {
    console.error("[boot] prisma migrate deploy failed with status", migrateExit);
    process.exit(migrateExit);
  }
  console.error("[boot] prisma migrate deploy completed OK");
}

if (seedOnBoot) {
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — running idempotent demo seed (add missing only, never overwrite) …");
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  const seedResult = spawnSync("npx", ["tsx", seedScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  if ((seedResult.status ?? 1) !== 0) {
    console.error("[boot] seed script failed with status", seedResult.status, "— continuing anyway");
  } else {
    console.error("[boot] seed script completed OK");
  }
}

const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
const smEpForChild = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
if (smEpForChild) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEpForChild;
if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

const nestEnv = {
  ...process.env,
  PORT: String(nestPort),
  LISTEN_HOST: "127.0.0.1",
};

const mainJs = path.join(__dirname, "dist", "main.js");
console.error(
  "[boot] spawning Nest",
  mainJs,
  "internal PORT=",
  nestEnv.PORT,
  "public PORT=",
  publicPort,
  "NODE_ENV=",
  nestEnv.NODE_ENV ?? "",
);
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

const nestHealthy = await waitForNestHealth();
if (!nestHealthy) {
  console.error("[boot] Nest did not become healthy on internal port within timeout");
  process.exit(1);
}

nestReady = true;
console.error("[boot] proxying public port", publicPort, "to Nest on", nestPort);
