/**
 * Demo-data seed Lambda entry (Q10 Part B, NON-PRODUCTION ONLY). Same file in every Kiorex v2 API repo; the product is configured by env set in Dockerfile.seed:
 *   SEED_DEMO_ENTRY   compiled demo seed, e.g. dist-seed/prisma/demo/seed-demo.js          (required)
 *   SEED_BASE_ENTRY   compiled base seed that must run first (plans, market, dev clients)  (optional)
 *   SEED_SYNC_ENTRY  compiled provider sync (kiorex-platform only; step "sync" runs it between the Kiorly seeds and the Kiorex demo seed)
 *   SEED_MIGRATE      "true" -> `prisma migrate deploy` first (default true)
 * Event: { "reset": true|false, "steps": ["migrate","base","demo"], "env": { KIORLY_BASE_URL, LAB_BASE_URL, DEMO_HANDOFF_JSON, ... } }   (all optional)
 * Returns { ok, steps: [{ name, exit }], handoff } where `handoff` is the JSON the seed printed on a `DEMO_HANDOFF {...}` line (passed on to the next product's seed).
 *
 * Guards: refuses unless DEMO_SEED_ALLOWED=true AND KIORLY_ENV/ENV_TAG is not production (the compiled seeds repeat the check, src/common/demo-seed-guard.ts).
 * Secrets: the DB credentials and the runtime secrets come from Secrets Manager into the child's environment only; nothing secret is logged or returned.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PROD = new Set(["prod", "production", "prd", "live"]);
/** Event env keys a caller may set (sibling products' URLs / hand-off between seeds). Anything else is ignored. */
const EVENT_ENV_ALLOWED = new Set(["KIORLY_BASE_URL", "KIORLY_CLIENT_KEY", "LAB_BASE_URL", "PHARMACY_BASE_URL", "DEMO_HANDOFF_JSON", "DEMO_SUB_MAP_JSON", "OIDC_ISSUER", "DEMO_SEED_NOW"]);

export function assertAllowed(env = process.env) {
  if (env.DEMO_SEED_ALLOWED !== "true") throw new Error("Refusing: DEMO_SEED_ALLOWED=true is not set");
  const tags = [env.KIORLY_ENV, env.KIOREX_ENV, env.ENV_TAG].map((v) => v?.trim().toLowerCase()).filter(Boolean);
  if (!tags.length) throw new Error("Refusing: the environment is not declared (KIORLY_ENV / ENV_TAG)");
  if (tags.some((t) => PROD.has(t))) throw new Error("Refusing: this is a production environment");
}

function vpceHttps(host) {
  if (!host) return undefined;
  const h = host.trim().replace(/^Z[a-z0-9]+:(?=vpce-)/i, "");
  return h ? `https://${h}` : undefined;
}

/** The Lambda Node runtime ships the AWS SDK v3; imported lazily so the guard can be tested without it. */
async function sm() {
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const endpoint = vpceHttps(process.env.SECRETS_MANAGER_VPCE_HOST);
  if (process.env.KMS_VPCE_HOST) process.env.AWS_ENDPOINT_URL_KMS = vpceHttps(process.env.KMS_VPCE_HOST);
  const client = new SecretsManagerClient({ region, ...(endpoint ? { endpoint } : {}) });
  return { send: (cmd) => client.send(cmd), GetSecretValueCommand };
}

async function secretString(client, id) {
  return (await client.send(new client.GetSecretValueCommand({ SecretId: id }))).SecretString ?? "";
}

async function databaseUrl(client) {
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) throw new Error("DB_SECRET_ARN is required");
  const j = JSON.parse(await secretString(client, arn));
  const host = j.host ?? j.hostname ?? j.endpoint ?? process.env.DB_HOST;
  if (!host) throw new Error("DB secret has no host");
  const db = j.dbname ?? j.database ?? process.env.DB_NAME ?? "postgres";
  return `postgresql://${encodeURIComponent(String(j.username ?? ""))}:${encodeURIComponent(String(j.password ?? ""))}@${host}:${j.port ?? 5432}/${db}?schema=public&sslmode=no-verify&connection_limit=5`;
}

/** DEMO_SEED_RUNTIME_SECRETS = { ENV_NAME: "arn:...:secret:name-xxxx[:jsonKey::]" } (the App Runner secret syntax) -> env values for the child only. */
async function runtimeSecrets(client) {
  const out = {};
  let map = {};
  try { map = JSON.parse(process.env.DEMO_SEED_RUNTIME_SECRETS || "{}"); } catch { /* ignore */ }
  for (const [name, ref] of Object.entries(map)) {
    const m = String(ref).match(/^(arn:aws:secretsmanager:[^:]+:\d+:secret:[^:]+)(?::([^:]*):[^:]*:[^:]*)?$/);
    if (!m) continue;
    try {
      const raw = await secretString(client, m[1]);
      out[name] = m[2] ? String(JSON.parse(raw)[m[2]] ?? "") : raw;
    } catch (e) {
      console.warn(`[demo-seed] runtime secret for ${name} not readable (${e.name}); continuing without it`);
    }
  }
  return out;
}

function run(name, args, env, input) {
  console.log(`[demo-seed] step ${name} ...`);
  const r = spawnSync(args[0], args.slice(1), { cwd: root, env, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { name, exit: r.status ?? 1, stdout: r.stdout ?? "" };
}

export async function handler(event = {}) {
  assertAllowed();
  console.log(`[demo-seed] NON-PRODUCTION demo seed: product=${process.env.SEED_PRODUCT ?? "?"} env=${process.env.KIORLY_ENV} reset=${Boolean(event.reset)}`);
  const client = await sm();
  const env = { ...process.env, ...(await runtimeSecrets(client)) };
  for (const [k, v] of Object.entries(event.env ?? {})) if (EVENT_ENV_ALLOWED.has(k) && typeof v === "string") env[k] = v;
  if (event.reset) env.DEMO_REISSUE_LINKS = "true"; // the Lab seed re-issues the nurse-sample report link on a reset
  env.DATABASE_URL = await databaseUrl(client);
  env.PATH = `${path.join(root, "node_modules", ".bin")}:/usr/local/bin:${process.env.PATH ?? ""}`;
  const wanted = event.steps ?? ["migrate", "base", "demo"];
  const steps = [];
  let handoff = null;
  if (wanted.includes("migrate") && process.env.SEED_MIGRATE !== "false") {
    const s = run("migrate", ["npx", "prisma", "migrate", "deploy"], env);
    steps.push({ name: s.name, exit: s.exit });
    if (s.exit !== 0) return { ok: false, steps };
  }
  if (wanted.includes("base") && process.env.SEED_BASE_ENTRY) {
    const s = run("base", ["node", process.env.SEED_BASE_ENTRY], env);
    steps.push({ name: s.name, exit: s.exit });
    if (s.exit !== 0) return { ok: false, steps };
  }
  if (wanted.includes("sync") && process.env.SEED_SYNC_ENTRY) {
    const s = run("sync", ["node", process.env.SEED_SYNC_ENTRY], env);
    steps.push({ name: s.name, exit: s.exit });
    if (s.exit !== 0) return { ok: false, steps };
  }
  if (wanted.includes("demo")) {
    const entry = process.env.SEED_DEMO_ENTRY;
    if (!entry) throw new Error("SEED_DEMO_ENTRY is not configured in this image");
    const s = run("demo", ["node", entry, ...(event.reset ? ["--reset"] : [])], env);
    steps.push({ name: s.name, exit: s.exit });
    const line = s.stdout.split("\n").find((l) => l.startsWith("DEMO_HANDOFF "));
    if (line) { try { handoff = JSON.parse(line.slice("DEMO_HANDOFF ".length)); } catch { /* ignore */ } }
    if (s.exit !== 0) return { ok: false, steps, handoff };
  }
  console.log("[demo-seed] completed OK");
  return { ok: true, steps, handoff };
}

// Local/CI dry run of the guard only: `node run.mjs --check`
if (process.argv[2] === "--check") {
  try { assertAllowed(); console.log("guard: allowed"); } catch (e) { console.error(`guard: ${e.message}`); process.exit(2); }
}
