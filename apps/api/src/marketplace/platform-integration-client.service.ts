import { createHash, randomBytes } from "node:crypto";
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { PgRateLimiter } from "../common/pg-rate-limit";
import { PrismaService } from "../prisma/prisma.service";
import {
  generateClientKey,
  generateClientSecret,
  hashIntegrationSecret,
  verifyIntegrationSecret,
} from "../integrations/integration-token";

export type PlatformIntegrationPrincipal = {
  id: string;
  clientKey: string;
  name: string;
  scopes: string[];
  ipAllowlist: string[];
};

@Injectable()
export class PlatformIntegrationClientService {
  /**
   * Successful secret verifications, keyed by sha256(storedHash + secret). bcryptjs is pure JS (~200 ms of blocked event loop per compare),
   * so a Kiorex search fanning out dozens of slot calls used to serialise for seconds and time out. A rotated secret changes the stored
   * hash, hence the key; a deactivated client is still rejected by the row lookup. Only successes are cached, for a short time.
   */
  private readonly verified = new Map<string, number>();
  private static readonly VERIFIED_TTL_MS = 5 * 60 * 1000;

  private readonly limiter: PgRateLimiter;
  /** A nonce is remembered for twice the signature skew window, on every instance (Postgres), so a captured request cannot be replayed on another instance either. */
  private static readonly NONCE_TTL_MS = 10 * 60 * 1000;
  /** FAILED secret attempts: per client key AND source address, plus a looser per-address ceiling (an attacker who only knows a public client key cannot lock the real caller out: the real caller has another address). */
  static readonly SECRET_FAIL_PER_CLIENT_IP = { limit: 10, windowMs: 15 * 60_000 } as const;
  static readonly SECRET_FAIL_PER_IP = { limit: 40, windowMs: 15 * 60_000 } as const;

  constructor(private readonly prisma: PrismaService) {
    this.limiter = new PgRateLimiter(prisma as never);
  }

  generateClientKey(): string {
    return `ic_plt_${randomBytes(12).toString("base64url")}`;
  }

  async createClient(name: string): Promise<{ clientKey: string; secret: string; id: string }> {
    const clientKey = this.generateClientKey();
    const secret = generateClientSecret();
    const secretHash = await hashIntegrationSecret(secret);
    const row = await this.prisma.platformIntegrationClient.create({
      data: { name, clientKey, secretHash, scopes: ["MARKETPLACE"] },
    });
    return { clientKey, secret, id: row.id };
  }

  /** Refuses (429) when this source already failed too often; only failures are counted, a correct secret is never delayed by someone else's guesses. */
  private async assertNotThrottled(clientKey: string, ip: string): Promise<void> {
    const c = PlatformIntegrationClientService.SECRET_FAIL_PER_CLIENT_IP, i = PlatformIntegrationClientService.SECRET_FAIL_PER_IP;
    const [a, b] = await Promise.all([this.limiter.blocked(`mkt-secret-fail:${clientKey}:${ip}`, c.limit, c.windowMs), this.limiter.blocked(`mkt-secret-fail-ip:${ip}`, i.limit, i.windowMs)]);
    const hit = !a.ok ? a : !b.ok ? b : null;
    if (hit) throw new HttpException({ message: "Too many failed attempts", code: "RATE_LIMITED", retryAfterSec: hit.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async recordFailure(clientKey: string, ip: string): Promise<void> {
    const c = PlatformIntegrationClientService.SECRET_FAIL_PER_CLIENT_IP, i = PlatformIntegrationClientService.SECRET_FAIL_PER_IP;
    await Promise.all([this.limiter.hit(`mkt-secret-fail:${clientKey}:${ip}`, c.limit, c.windowMs), this.limiter.hit(`mkt-secret-fail-ip:${ip}`, i.limit, i.windowMs)]).catch(() => undefined);
  }

  async authenticate(clientKey: string, secret: string, ip = "-"): Promise<PlatformIntegrationPrincipal> {
    await this.assertNotThrottled(clientKey, ip).catch((e) => { if (e instanceof HttpException) throw e; /* the limiter table is unavailable: fail open, the secret check below still decides */ });
    const row = await this.prisma.platformIntegrationClient.findFirst({
      where: { clientKey, deactivatedAt: null },
    });
    if (!row) { await this.recordFailure(clientKey, ip); throw new UnauthorizedException("Unknown marketplace client"); }
    const cacheKey = createHash("sha256").update(`${row.secretHash}\u0000${secret}`).digest("hex");
    const now = Date.now();
    const cachedAt = this.verified.get(cacheKey);
    const ok = cachedAt !== undefined && now - cachedAt < PlatformIntegrationClientService.VERIFIED_TTL_MS ? true : await verifyIntegrationSecret(secret, row.secretHash);
    if (ok) {
      this.verified.set(cacheKey, now);
      if (this.verified.size > 200) for (const [k, at] of this.verified) if (now - at > PlatformIntegrationClientService.VERIFIED_TTL_MS) this.verified.delete(k);
    }
    if (!ok) { await this.recordFailure(clientKey, ip); throw new UnauthorizedException("Invalid marketplace client secret"); }
    void this.prisma.platformIntegrationClient
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: row.id,
      clientKey: row.clientKey,
      name: row.name,
      scopes: row.scopes ?? ["MARKETPLACE"],
      ipAllowlist: row.ipAllowlist ?? [],
    };
  }

  /** Persisted nonce store: one INSERT .. ON CONFLICT DO NOTHING, so the first request wins on every instance and a replay (same client, same nonce) is refused. */
  async assertNonce(clientId: string, nonce: string): Promise<void> {
    const now = Date.now();
    const inserted = await this.prisma.$executeRawUnsafe(
      `INSERT INTO "MarketplaceNonce" ("clientId","nonce","expiresAt") VALUES ($1,$2,$3) ON CONFLICT ("clientId","nonce") DO NOTHING`,
      clientId, nonce.slice(0, 200), new Date(now + PlatformIntegrationClientService.NONCE_TTL_MS),
    );
    if (!inserted) throw new UnauthorizedException("Replayed nonce");
    if (Math.random() < 0.02) void this.prisma.$executeRawUnsafe(`DELETE FROM "MarketplaceNonce" WHERE "expiresAt" < $1`, new Date(now)).catch(() => undefined);
  }

  assertIpAllowed(principal: PlatformIntegrationPrincipal, ip: string | undefined): void {
    const list = principal.ipAllowlist?.filter(Boolean) ?? [];
    if (!list.length) return;
    const normalized = ip?.trim() || "";
    if (!normalized || !list.includes(normalized)) {
      throw new UnauthorizedException("Client IP not allowlisted");
    }
  }
}