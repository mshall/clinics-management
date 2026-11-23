import { Logger } from "@nestjs/common";
import { getSecretsAdapter } from "../../platform/adapters";
import { STUN_SERVERS, type IceServer, type IceServersResult, type TurnCredentialsProvider } from "./turn-credentials.provider";

const API = "https://rtc.live.cloudflare.com/v1/turn/keys";
const CACHE_MS = 60_000;
/** Cloudflare accepts a ttl up to 48 h; a visit never needs more than the remaining window plus margin. */
export const MAX_TURN_TTL_SECONDS = 4 * 3600;
export const MIN_TURN_TTL_SECONDS = 600;

export function turnSecretName(): string {
  const explicit = process.env.TELEHEALTH_TURN_SECRET_NAME?.trim();
  if (explicit) return explicit;
  const env = process.env.KIORLY_ENV?.trim() || process.env.APP_ENV?.trim() || "staging";
  return `/kiorly-clinic/${env}/cloudflare-turn`;
}

/** Pure: keep STUN + TURN entries, drop port-53 URLs (blocked or slow on several browsers/networks), never invent servers. */
export function normalizeCloudflareIceServers(raw: unknown): IceServer[] {
  const list = (raw as { iceServers?: unknown })?.iceServers;
  if (!Array.isArray(list)) return [];
  const out: IceServer[] = [];
  for (const e of list as Array<{ urls?: string | string[]; username?: string; credential?: string }>) {
    const urls = (Array.isArray(e?.urls) ? e.urls : e?.urls ? [e.urls] : []).filter((u) => typeof u === "string" && !/:53(\?|$)/.test(u));
    if (urls.length === 0) continue;
    out.push({ urls, ...(e.username ? { username: e.username } : {}), ...(e.credential ? { credential: e.credential } : {}) });
  }
  return out;
}

export class CloudflareTurnProvider implements TurnCredentialsProvider {
  private readonly log = new Logger(CloudflareTurnProvider.name);
  private cache: { value: { turnKeyId: string; apiToken: string } | null; at: number } | null = null;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async loadSecret(): Promise<{ turnKeyId: string; apiToken: string } | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    let value: { turnKeyId: string; apiToken: string } | null = null;
    try {
      const raw = await getSecretsAdapter().getSecret(turnSecretName());
      if (raw) {
        const j = JSON.parse(raw) as { turnKeyId?: string; apiToken?: string };
        if (j.turnKeyId?.trim() && j.apiToken?.trim()) value = { turnKeyId: j.turnKeyId.trim(), apiToken: j.apiToken.trim() };
      }
    } catch {
      value = null;
    }
    this.cache = { value, at: Date.now() };
    return value;
  }

  async getIceServers(opts: { ttlSeconds: number }): Promise<IceServersResult> {
    const stunOnly: IceServersResult = { iceServers: STUN_SERVERS.map((s) => ({ ...s })), turn: "stun-only", expiresInSeconds: null };
    const secret = await this.loadSecret();
    if (!secret) return stunOnly; // no secret: documented STUN-only fallback
    const ttl = Math.min(MAX_TURN_TTL_SECONDS, Math.max(MIN_TURN_TTL_SECONDS, Math.floor(opts.ttlSeconds)));
    try {
      const res = await this.fetchImpl(`${API}/${encodeURIComponent(secret.turnKeyId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const ice = normalizeCloudflareIceServers(await res.json());
      if (!ice.some((s) => s.credential)) throw new Error("no TURN entry in response");
      return { iceServers: ice, turn: "turn", expiresInSeconds: ttl };
    } catch (e) {
      // Never log the token or the credential; the message carries only the failure class.
      this.log.warn(`Cloudflare TURN unavailable, falling back to STUN-only (${e instanceof Error ? e.message : "error"})`);
      return { ...stunOnly, turn: "degraded" };
    }
  }
}
