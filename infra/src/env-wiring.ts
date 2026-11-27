/**
 * Environment wiring of the Clinic API (ADR-059): Passport, CORS, Kiorex URLs, partner registration. Pure functions, no AWS calls.
 *
 * The values come from `infra/config/<name>.json`, which is GENERATED from the workspace URL registry
 * (`node _docs/registry/validate-registry.mjs --emit env|cors --env test`) and committed: hosts are not secrets, secrets are NEVER in it.
 * A secret is referenced by Secrets Manager NAME and JSON key; the stack grants the instance role read access and passes the reference to
 * App Runner (`runtimeEnvironmentSecrets`), so a value never appears in git, in the template or in a log.
 *
 * File shape:
 *   { "environment": "kx-test",
 *     "env":     { "APP_WEB_URL": "https://clinics.test.kiorly.com", ... },
 *     "secrets": { "KIOREX_OIDC_CLIENT_SECRET": { "secretName": "/kx/test/clinic", "key": "KIOREX_OIDC_CLIENT_SECRET" }, ... } }
 *
 * No file = no change at all (a fork or a standalone deployment keeps today's behaviour).
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface SecretRef { secretName: string; key: string }
export interface ClinicEnvConfig {
  environment: string;
  env: Record<string, string>;
  secrets: Record<string, SecretRef>;
}

/** Names the stack itself owns: the config can never override the database, runtime or secret plumbing of the live service. */
export const RESERVED_ENV_NAMES: readonly string[] = [
  "NODE_ENV", "PORT", "AWS_REGION", "AWS_DEFAULT_REGION", "DB_SECRET_ARN", "DATABASE_URL", "JWT_SECRET", "OPENAI_API_KEY",
  "PRISMA_MIGRATE_ON_BOOT", "PRISMA_SEED_ON_BOOT", "UPLOAD_STORAGE", "S3_UPLOAD_BUCKET", "SECRETS_MANAGER_VPCE_HOST", "KMS_VPCE_HOST",
  "STS_VPCE_HOST", "KIORLY_DEPLOY_TARGET", "KIORLY_HOST_CELL", "TZ", "SWAGGER_ENABLED", "WEB_BUILD_ID",
];

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SECRETISH_RE = /(SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY|CLIENT_KEY|SIGNING)/;
/** Public names that merely look secret-ish (identifiers, not values). */
const SECRETISH_OK = new Set(["KIOREX_OIDC_CLIENT_ID"]);

export function validateClinicEnvConfig(cfg: ClinicEnvConfig): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(cfg.env)) {
    seen.add(name);
    if (!NAME_RE.test(name)) problems.push(`env ${name}: invalid variable name`);
    if (RESERVED_ENV_NAMES.includes(name)) problems.push(`env ${name}: reserved (owned by the stack)`);
    if (SECRETISH_RE.test(name) && !SECRETISH_OK.has(name)) problems.push(`env ${name}: looks like a secret; put it in "secrets" (by reference)`);
    if (typeof value !== "string" || !value.trim()) problems.push(`env ${name}: empty value`);
    else if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(value)) problems.push(`env ${name}: localhost value in a deployed configuration`);
    else if (/^https?:\/\//i.test(value) && !/^https:\/\//i.test(value)) problems.push(`env ${name}: http URL (deployed hosts are https)`);
    if (/AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY/.test(String(value))) problems.push(`env ${name}: looks like a credential`);
  }
  for (const [name, ref] of Object.entries(cfg.secrets)) {
    if (!NAME_RE.test(name)) problems.push(`secret ${name}: invalid variable name`);
    if (RESERVED_ENV_NAMES.includes(name)) problems.push(`secret ${name}: reserved (owned by the stack)`);
    if (seen.has(name)) problems.push(`secret ${name}: also given as a plain env value`);
    if (!ref || typeof ref.secretName !== "string" || !ref.secretName.startsWith("/") || /[^A-Za-z0-9/_+=.@-]/.test(ref.secretName)) problems.push(`secret ${name}: secretName must be a Secrets Manager name starting with "/"`);
    if (!ref || typeof ref.key !== "string" || !/^[A-Za-z0-9_]+$/.test(ref.key)) problems.push(`secret ${name}: key must be a JSON key name`);
  }
  return problems;
}

/** Reads `<dir>/<file>` (default `kx-test.json`); null when absent. Throws with the problem list when the file is invalid (a bad config must stop the deploy, not half-apply). */
export function loadClinicEnvConfig(configDir: string, file = process.env.KIORLY_ENV_CONFIG?.trim() || "kx-test.json"): ClinicEnvConfig | null {
  const p = path.join(configDir, file);
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<ClinicEnvConfig>;
  const cfg: ClinicEnvConfig = { environment: String(raw.environment ?? file), env: raw.env ?? {}, secrets: raw.secrets ?? {} };
  const problems = validateClinicEnvConfig(cfg);
  if (problems.length) throw new Error(`invalid Clinic environment config ${file}:\n - ${problems.join("\n - ")}`);
  return cfg;
}

/** App Runner `runtimeEnvironmentVariables` entries for the config (stable order). */
export function wiringEnvVars(cfg: ClinicEnvConfig | null): { name: string; value: string }[] {
  if (!cfg) return [];
  return Object.keys(cfg.env).sort().map((name) => ({ name, value: cfg.env[name]!.trim() }));
}

/** Distinct secret names the instance role needs read access to. */
export function wiringSecretNames(cfg: ClinicEnvConfig | null): string[] {
  if (!cfg) return [];
  return [...new Set(Object.values(cfg.secrets).map((r) => r.secretName))].sort();
}
