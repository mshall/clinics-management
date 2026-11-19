import { getSecretsAdapter } from "../../platform/adapters";
import type { ConfigService } from "@nestjs/config";

const smCache = new Map<string, { value: string; at: number }>();
const SM_CACHE_MS = 60_000;

/**
 * Resolves API keys only here — application code must not read OPENAI_* env vars directly.
 * secretRef forms:
 * - `env:OPENAI_API_KEY` — local dev bridge (gitignored .env)
 * - `env:AI_API_KEY` — generic local dev
 * - AWS Secrets Manager ARN or secret id (JSON field apiKey or plain string)
 */
export async function resolveAiApiKey(secretRef: string | null | undefined, config: ConfigService): Promise<string | null> {
  const ref = secretRef?.trim();
  if (ref?.startsWith("env:")) {
    const envName = ref.slice(4).trim();
    if (!envName) return null;
    return config.get<string>(envName)?.trim() || null;
  }

  if (!ref) {
    return config.get<string>("AI_API_KEY")?.trim() || config.get<string>("OPENAI_API_KEY")?.trim() || null;
  }

  const cached = smCache.get(ref);
  if (cached && Date.now() - cached.at < SM_CACHE_MS) return cached.value;

  try {
    const raw = await getSecretsAdapter().getSecret(ref);
    if (!raw) return null;
    let key: string | null = raw;
    try {
      const parsed = JSON.parse(raw) as { apiKey?: string; API_KEY?: string };
      key = parsed.apiKey?.trim() || parsed.API_KEY?.trim() || raw;
    } catch {
      key = raw;
    }
    if (key) smCache.set(ref, { value: key, at: Date.now() });
    return key;
  } catch {
    return null;
  }
}