import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { getLocalFiscalSecret } from "../fiscal-devices/fiscal-device-local-secrets";

const smCache = new Map<string, { value: EtaConnectionConfig; at: number }>();
const SM_CACHE_MS = 60_000;

export type EtaConnectionConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  signingKey?: string;
  tokenUrl?: string;
  oauthScope?: string;
  receiptSubmitPath?: string;
  receiptStatusPath?: string;
  posSerial?: string;
  posOsVersion?: string;
  posModelFramework?: string;
  presharedKey?: string;
};

type EtaSecretJson = {
  baseUrl?: string;
  ETA_API_BASE_URL?: string;
  clientId?: string;
  ETA_CLIENT_ID?: string;
  clientSecret?: string;
  ETA_CLIENT_SECRET?: string;
  signingKey?: string;
  ETA_SIGNING_KEY?: string;
  tokenUrl?: string;
  ETA_TOKEN_URL?: string;
  oauthScope?: string;
  ETA_OAUTH_SCOPE?: string;
  receiptSubmitPath?: string;
  ETA_RECEIPT_SUBMIT_PATH?: string;
  receiptStatusPath?: string;
  ETA_RECEIPT_STATUS_PATH?: string;
  posSerial?: string;
  posOsVersion?: string;
  posModelFramework?: string;
  presharedKey?: string;
};

function fromEnv(): EtaConnectionConfig | null {
  const baseUrl = process.env.ETA_API_BASE_URL?.trim();
  const clientId = process.env.ETA_CLIENT_ID?.trim();
  const clientSecret = process.env.ETA_CLIENT_SECRET?.trim();
  if (!baseUrl || !clientId || !clientSecret) return null;
    return {
      baseUrl,
      clientId,
      clientSecret,
      signingKey: process.env.ETA_SIGNING_KEY?.trim() || clientSecret,
      tokenUrl: process.env.ETA_TOKEN_URL?.trim(),
      oauthScope: process.env.ETA_OAUTH_SCOPE?.trim(),
      receiptSubmitPath: process.env.ETA_RECEIPT_SUBMIT_PATH?.trim(),
      receiptStatusPath: process.env.ETA_RECEIPT_STATUS_PATH?.trim(),
      posSerial: process.env.ETA_POS_SERIAL?.trim(),
      posOsVersion: process.env.ETA_POS_OS_VERSION?.trim(),
      posModelFramework: process.env.ETA_POS_MODEL_FRAMEWORK?.trim(),
      presharedKey: process.env.ETA_POS_PRESHARED_KEY?.trim(),
    };
  }

function parseSecretJson(raw: string): EtaConnectionConfig | null {
  try {
    const j = JSON.parse(raw) as EtaSecretJson;
    const baseUrl = j.baseUrl?.trim() || j.ETA_API_BASE_URL?.trim();
    const clientId = j.clientId?.trim() || j.ETA_CLIENT_ID?.trim();
    const clientSecret = j.clientSecret?.trim() || j.ETA_CLIENT_SECRET?.trim();
    if (!baseUrl || !clientId || !clientSecret) return null;
    const signingKey = j.signingKey?.trim() || j.ETA_SIGNING_KEY?.trim() || clientSecret;
    return {
      baseUrl,
      clientId,
      clientSecret,
      signingKey,
      tokenUrl: j.tokenUrl?.trim() || j.ETA_TOKEN_URL?.trim(),
      oauthScope: j.oauthScope?.trim() || j.ETA_OAUTH_SCOPE?.trim(),
      receiptSubmitPath: j.receiptSubmitPath?.trim() || j.ETA_RECEIPT_SUBMIT_PATH?.trim(),
      receiptStatusPath: j.receiptStatusPath?.trim() || j.ETA_RECEIPT_STATUS_PATH?.trim(),
      posSerial: j.posSerial?.trim(),
      posOsVersion: j.posOsVersion?.trim(),
      posModelFramework: j.posModelFramework?.trim(),
      presharedKey: j.presharedKey?.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Per-clinic ETA credentials from ProviderCredential.secretRef.
 * Ref forms: `env:ETA_CLIENT_SECRET` (field bridge), Secrets Manager ARN/id (JSON or plain secret string).
 */
export async function resolveEtaConnection(secretRef: string | null | undefined): Promise<EtaConnectionConfig | null> {
  const ref = secretRef?.trim();
  if (ref?.startsWith("local:")) {
    const raw = getLocalFiscalSecret(ref);
    if (raw) return parseSecretJson(raw);
    return null;
  }

  if (ref?.startsWith("env:")) {
    if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
      return null;
    }
    return fromEnv();
  }

  if (!ref) {
    if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
      return null;
    }
    return fromEnv();
  }

  const cached = smCache.get(ref);
  if (cached && Date.now() - cached.at < SM_CACHE_MS) return cached.value;

  try {
    const client = new SecretsManagerClient({});
    const out = await client.send(new GetSecretValueCommand({ SecretId: ref }));
    const raw = out.SecretString?.trim();
    if (!raw) return null;
    const parsed = parseSecretJson(raw) ?? null;
    if (parsed) {
      smCache.set(ref, { value: parsed, at: Date.now() });
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}