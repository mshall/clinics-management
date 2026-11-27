import { defaultFromAddress } from "../config/host-config";
import { providerMode, type ProviderKind } from "./provider-mode";
import { pushProblems } from "./vendors/push";

/**
 * Env-driven configuration + fail-fast validation for the real provider adapters (SMS, Email, WhatsApp, PSP).
 * Going live = set KIORLY_PROVIDER_MODE_<KIND>=real (or <KIND>_MODE=real) and supply the variables below; nothing else.
 * Errors name variables only, never values.
 */
type Env = NodeJS.ProcessEnv;

const get = (env: Env, k: string): string => env[k]?.trim() ?? "";
const int = (env: Env, k: string, d: number): number => {
  const n = Number(get(env, k));
  return Number.isFinite(n) && n >= 0 && get(env, k) !== "" ? n : d;
};

export type HttpProviderConfig = {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
};

function httpConfig(env: Env, prefix: string, keyVar: string): HttpProviderConfig {
  return {
    apiUrl: get(env, `${prefix}_API_URL`),
    apiKey: get(env, keyVar),
    webhookSecret: get(env, `${prefix}_WEBHOOK_SECRET`),
    timeoutMs: int(env, `${prefix}_TIMEOUT_MS`, 10_000),
    maxRetries: int(env, `${prefix}_MAX_RETRIES`, 2),
    backoffMs: int(env, `${prefix}_RETRY_BACKOFF_MS`, 300),
  };
}

export type SmsConfig = HttpProviderConfig & { senderId: string };
/** SMS_PROVIDER=twilio selects the native Twilio client (default API base, secret = the auth token in SMS_API_KEY "<AccountSid>:<AuthToken>"); anything else = the neutral gateway. */
export const smsVendor = (env: Env = process.env): "twilio" | "gateway" => (get(env, "SMS_PROVIDER").toLowerCase() === "twilio" ? "twilio" : "gateway");
export const smsConfig = (env: Env = process.env): SmsConfig => {
  const c = { ...httpConfig(env, "SMS", "SMS_API_KEY"), senderId: get(env, "SMS_SENDER_ID") };
  if (smsVendor(env) === "twilio") {
    if (!c.apiUrl) c.apiUrl = "https://api.twilio.com";
    if (!c.webhookSecret && c.apiKey.includes(":")) c.webhookSecret = c.apiKey.slice(c.apiKey.indexOf(":") + 1);
  }
  return c;
};

export type EmailTransport = "ses" | "http";
export const emailTransport = (env: Env = process.env): EmailTransport => (get(env, "EMAIL_TRANSPORT").toLowerCase() === "http" ? "http" : "ses");
export type EmailHttpConfig = HttpProviderConfig & { fromAddress: string };
export const emailHttpConfig = (env: Env = process.env): EmailHttpConfig => ({
  ...httpConfig(env, "EMAIL", "EMAIL_API_KEY"),
  fromAddress: get(env, "EMAIL_FROM_ADDRESS") || defaultFromAddress(env),
});

export type WhatsAppBackend = "meta_cloud" | "http";
export const whatsAppBackend = (env: Env = process.env): WhatsAppBackend => (get(env, "WHATSAPP_PROVIDER").toLowerCase() === "http" ? "http" : "meta_cloud");
export type WhatsAppHttpConfig = HttpProviderConfig & { senderId: string };
export const whatsAppHttpConfig = (env: Env = process.env): WhatsAppHttpConfig => ({
  ...httpConfig(env, "WHATSAPP", "WHATSAPP_API_TOKEN"),
  senderId: get(env, "WHATSAPP_SENDER_ID"),
});

export type PspConfig = HttpProviderConfig & { merchantId: string; callbackUrl: string };
export const pspConfig = (env: Env = process.env): PspConfig => ({
  ...httpConfig(env, "PSP", "PSP_API_KEY"),
  merchantId: get(env, "PSP_MERCHANT_ID"),
  callbackUrl: get(env, "PSP_CALLBACK_URL"),
});

/**
 * PAYMENT_PROVIDER=vendor (PSP_PROVIDER also read) selects the NATIVE Paymob Accept + FawryPay clients (wire format copied from the Kiorex platform) for the card/link
 * providers when the psp mode is real; anything else keeps the neutral JSON gateway (PSP_* env). PAYMENT_ENABLED_PSPS (default "paymob,fawry") limits which are registered.
 */
export const pspVendor = (env: Env = process.env): "vendor" | "gateway" => ((get(env, "PAYMENT_PROVIDER") || get(env, "PSP_PROVIDER")).toLowerCase() === "vendor" ? "vendor" : "gateway");
export const enabledPsps = (env: Env = process.env): Array<"paymob" | "fawry"> => (get(env, "PAYMENT_ENABLED_PSPS") || "paymob,fawry").split(",").map((s) => s.trim().toLowerCase()).filter((s): s is "paymob" | "fawry" => s === "paymob" || s === "fawry");
export type VendorPspConfig = {
  timeoutMs: number; maxRetries: number; backoffMs: number;
  /** Public origin of THIS API (webhook URLs handed to the PSP) and of the web app (return URL). */
  publicApiUrl: string; webUrl: string;
  paymob: { apiUrl: string; secretKey: string; publicKey: string; hmacSecret: string; integrationIds: number[] };
  fawry: { apiUrl: string; merchantCode: string; secureKey: string };
};
export const vendorPspConfig = (env: Env = process.env): VendorPspConfig => ({
  timeoutMs: int(env, "PAYMENT_TIMEOUT_MS", 8_000), maxRetries: int(env, "PAYMENT_MAX_RETRIES", 2), backoffMs: int(env, "PAYMENT_RETRY_BACKOFF_MS", 300),
  publicApiUrl: (get(env, "PAYMENT_PUBLIC_API_URL") || get(env, "PUBLIC_API_URL")).replace(/\/+$/, ""), webUrl: (get(env, "APP_WEB_URL") || get(env, "PUBLIC_WEB_URL")).replace(/\/+$/, ""),
  paymob: { apiUrl: (get(env, "PAYMOB_API_URL") || "https://accept.paymob.com").replace(/\/+$/, ""), secretKey: get(env, "PAYMOB_SECRET_KEY"), publicKey: get(env, "PAYMOB_PUBLIC_KEY"), hmacSecret: get(env, "PAYMOB_HMAC_SECRET"),
    integrationIds: get(env, "PAYMOB_INTEGRATION_IDS").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) },
  fawry: { apiUrl: (get(env, "FAWRY_API_URL") || "https://www.atfawry.com").replace(/\/+$/, ""), merchantCode: get(env, "FAWRY_MERCHANT_CODE"), secureKey: get(env, "FAWRY_SECURE_KEY") },
});

export type MapsConfig = HttpProviderConfig & { accessKeyId: string; secretAccessKey: string; travelMode: string; country: string; centroidsJson: string; centroidsFile: string };
/** MAPS_MODE=real: Amazon Location Routes v2 (route matrix) over HTTPS. MAPS_API_URL=https://routes.geo.<region>.amazonaws.com; MAPS_API_KEY (Amazon Location API key) or MAPS_ACCESS_KEY_ID + MAPS_SECRET_ACCESS_KEY (SigV4). */
export const mapsConfig = (env: Env = process.env): MapsConfig => ({
  ...httpConfig(env, "MAPS", "MAPS_API_KEY"),
  accessKeyId: get(env, "MAPS_ACCESS_KEY_ID"), secretAccessKey: get(env, "MAPS_SECRET_ACCESS_KEY"),
  travelMode: get(env, "MAPS_TRAVEL_MODE") || "Car", country: get(env, "MAPS_COUNTRY") || "EGY",
  centroidsJson: get(env, "MAPS_DISTRICT_CENTROIDS_JSON"), centroidsFile: get(env, "MAPS_DISTRICT_CENTROIDS_FILE"),
});

function badUrl(url: string, env: Env): boolean {
  try {
    const u = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (env.NODE_ENV === "production" && u.protocol !== "https:" && !local) return true;
    return u.protocol !== "https:" && u.protocol !== "http:";
  } catch {
    return true;
  }
}

/** Returns one human line per problem; empty when everything real is correctly configured. */
export function providerEnvProblems(env: Env = process.env): string[] {
  // providerMode reads process.env; for injected envs temporarily mirror the relevant keys.
  const modeOf = (kind: ProviderKind) => (env === process.env ? providerMode(kind) : withEnv(env, () => providerMode(kind)));
  const problems: string[] = [];
  const need = (kind: string, vars: [string, string][], url?: string) => {
    for (const [name, value] of vars) if (!value) problems.push(`${kind}: ${name} is required when mode is real`);
    if (url && badUrl(url, env)) problems.push(`${kind}: URL must be a valid https URL (value not shown)`);
  };

  if (modeOf("sms") === "real") {
    const c = smsConfig(env);
    need("SMS", [["SMS_API_URL", c.apiUrl], ["SMS_API_KEY", c.apiKey], ["SMS_SENDER_ID", c.senderId], ["SMS_WEBHOOK_SECRET", c.webhookSecret]], c.apiUrl || undefined);
    if (smsVendor(env) === "twilio") {
      if (c.apiKey && !c.apiKey.includes(":")) problems.push('SMS: SMS_API_KEY must be "<AccountSid>:<AuthToken>" when SMS_PROVIDER=twilio');
      if (!get(env, "SMS_WEBHOOK_PUBLIC_URL")) problems.push("SMS: SMS_WEBHOOK_PUBLIC_URL is required when SMS_PROVIDER=twilio");
    } else if (get(env, "SMS_PROVIDER") && get(env, "SMS_PROVIDER").toLowerCase() !== "gateway") problems.push("SMS: SMS_PROVIDER must be gateway or twilio");
  }
  if (modeOf("email") === "real" && emailTransport(env) === "http") {
    const c = emailHttpConfig(env);
    need("EMAIL", [["EMAIL_API_URL", c.apiUrl], ["EMAIL_API_KEY", c.apiKey], ["EMAIL_WEBHOOK_SECRET", c.webhookSecret]], c.apiUrl || undefined);
  }
  if (modeOf("whatsapp") === "real") {
    if (whatsAppBackend(env) === "http") {
      const c = whatsAppHttpConfig(env);
      need("WHATSAPP", [["WHATSAPP_API_URL", c.apiUrl], ["WHATSAPP_API_TOKEN", c.apiKey], ["WHATSAPP_SENDER_ID", c.senderId], ["WHATSAPP_WEBHOOK_SECRET", c.webhookSecret]], c.apiUrl || undefined);
    } else {
      need("WHATSAPP", [
        ["WHATSAPP_ACCESS_TOKEN (or WHATSAPP_API_TOKEN)", get(env, "WHATSAPP_ACCESS_TOKEN") || get(env, "WHATSAPP_API_TOKEN")],
        ["WHATSAPP_PHONE_NUMBER_ID", get(env, "WHATSAPP_PHONE_NUMBER_ID")],
        ["WHATSAPP_APP_SECRET", get(env, "WHATSAPP_APP_SECRET")],
        ["WHATSAPP_VERIFY_TOKEN", get(env, "WHATSAPP_VERIFY_TOKEN")],
      ]);
    }
  }
  if ((get(env, "MOBILE_PUSH_MODE") ? get(env, "MOBILE_PUSH_MODE") === "real" : modeOf("push") === "real")) problems.push(...pushProblems(env).map((p) => `PUSH: ${p}`));
  if (modeOf("psp") === "real" && pspVendor(env) === "vendor") {
    const c = vendorPspConfig(env);
    const on = enabledPsps(env);
    if (!on.length) problems.push("PSP: PAYMENT_ENABLED_PSPS must list paymob and/or fawry");
    need("PSP", [["PAYMENT_PUBLIC_API_URL", c.publicApiUrl], ["APP_WEB_URL", c.webUrl]], c.publicApiUrl || undefined);
    if (on.includes("paymob")) need("PSP", [["PAYMOB_SECRET_KEY", c.paymob.secretKey], ["PAYMOB_PUBLIC_KEY", c.paymob.publicKey], ["PAYMOB_HMAC_SECRET", c.paymob.hmacSecret], ["PAYMOB_INTEGRATION_IDS", c.paymob.integrationIds.length ? "ok" : ""]], c.paymob.apiUrl);
    if (on.includes("fawry")) need("PSP", [["FAWRY_MERCHANT_CODE", c.fawry.merchantCode], ["FAWRY_SECURE_KEY", c.fawry.secureKey]], c.fawry.apiUrl);
  } else if (modeOf("psp") === "real") {
    const c = pspConfig(env);
    need("PSP", [["PSP_API_URL", c.apiUrl], ["PSP_API_KEY", c.apiKey], ["PSP_WEBHOOK_SECRET", c.webhookSecret]], c.apiUrl || undefined);
  }
  if (modeOf("maps") === "real") {
    const c = mapsConfig(env);
    need("MAPS", [["MAPS_API_URL", c.apiUrl], ["MAPS_API_KEY or MAPS_ACCESS_KEY_ID + MAPS_SECRET_ACCESS_KEY", c.apiKey || (c.accessKeyId && c.secretAccessKey ? "ok" : "")],
      ["MAPS_DISTRICT_CENTROIDS_JSON or MAPS_DISTRICT_CENTROIDS_FILE", c.centroidsJson || c.centroidsFile]], c.apiUrl || undefined);
  }
  return problems;
}

function withEnv<T>(env: Env, fn: () => T): T {
  const saved = process.env;
  process.env = env;
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

/** Startup check (main.ts): throws a clear, secret-free message when a real-mode provider is half-configured. */
export function assertProviderEnv(env: Env = process.env): void {
  const problems = providerEnvProblems(env);
  if (problems.length) {
    throw new Error(
      `Provider configuration invalid (mode=real but settings missing). Fix env/secrets or set the mode back to mock:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

export type ProviderStatusRow = { provider: string; mode: "mock" | "real"; vendor: string; ready: boolean };
/** Active mode + vendor of every provider kind for /health/ready and /health/providers. `ready` = no variable is missing for the active mode. Never a value. */
export function providerStatus(env: Env = process.env): ProviderStatusRow[] {
  const problemsFor = (kind: ProviderKind): number => {
    const saved = process.env;
    try { process.env = env; return providerEnvProblems(env).filter((p) => p.toLowerCase().startsWith(kind === "psp" ? "psp" : kind)).length; } finally { process.env = saved; }
  };
  const mode = (kind: ProviderKind) => (env === process.env ? providerMode(kind) : withEnv(env, () => providerMode(kind)));
  const vendor = (kind: ProviderKind, m: "mock" | "real"): string => {
    if (m === "mock") return "mock";
    if (kind === "sms") return smsVendor(env);
    if (kind === "email") return emailTransport(env) === "http" ? "http" : "ses";
    if (kind === "whatsapp") return whatsAppBackend(env) === "http" ? "http" : "meta_cloud";
    if (kind === "push") return "fcm+expo";
    if (kind === "psp") return pspVendor(env) === "vendor" ? `native:${enabledPsps(env).join("+")}` : "gateway";
    if (kind === "maps") return "amazon-location";
    return kind;
  };
  return (["email", "whatsapp", "sms", "push", "psp", "maps"] as ProviderKind[]).map((kind) => {
    const m = mode(kind);
    return { provider: kind, mode: m, vendor: vendor(kind, m), ready: m === "mock" || problemsFor(kind) === 0 };
  });
}
