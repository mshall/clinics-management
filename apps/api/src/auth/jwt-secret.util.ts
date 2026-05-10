import { ConfigService } from "@nestjs/config";

/** Plain JWT signing secret, or JSON from Secrets Manager `{"jwt":"..."}`. */
export function resolveJwtSigningSecret(config: ConfigService): string {
  const raw = config.getOrThrow<string>("JWT_SECRET").trim();
  if (!raw.startsWith("{")) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw) as { jwt?: string };
    if (typeof parsed.jwt === "string" && parsed.jwt.length > 0) {
      return parsed.jwt;
    }
  } catch {
    /* use raw */
  }
  return raw;
}
