import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PgRateLimiter } from "./pg-rate-limit";
import { clientIpOf } from "./http-hardening";
import { authRatePolicy, consumeRateLimit, isLoginPath, LOGIN_ACCOUNT_RATE, rateLimitKey } from "./rate-limit";

const clientIp = clientIpOf; // TRUSTED_PROXY_HOPS-aware (the leftmost X-Forwarded-For entry is attacker-controlled)

@Injectable()
export class PublicAuthRateLimitGuard implements CanActivate {
  private readonly log = new Logger("auth-rate-limit");
  private readonly shared?: PgRateLimiter;
  /**
   * KX-PT-L1: the counters live in Postgres (`PgRateLimiter`, the shared limiter Pharmacy, Lab and Kiorex use), so N API instances enforce ONE budget instead of N.
   * Without a database handle (unit tests constructing the guard directly) or when the table is unavailable it degrades to the per-instance in-memory window.
   */
  constructor(@Optional() prisma?: PrismaService) {
    if (prisma) this.shared = new PgRateLimiter(prisma as never);
  }

  private async consume(key: string, limit: number, windowMs: number): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
    if (this.shared) {
      try {
        const r = await this.shared.hit(key, limit, windowMs);
        return r.ok ? { ok: true } : { ok: false, retryAfterSec: r.retryAfterSec };
      } catch (e) {
        this.log.warn(`shared limiter unavailable, using the per-instance window: ${(e as Error).message}`);
      }
    }
    return consumeRateLimit(key, limit, windowMs);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      path?: string;
      url?: string;
      originalUrl?: string;
      method?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
      body?: { email?: string; phone?: string };
    }>();
    const path = (req.originalUrl ?? req.url ?? req.path ?? "").split("?")[0] ?? "";
    const ip = clientIp(req);
    const policy = authRatePolicy(path, req.method);
    // pre-validation: a body field may be an array / object (pentest 2026-11: `{"email":["a"]}` used to crash the guard with a 500)
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 254) : undefined);
    const key = rateLimitKey(["auth", path, ip, str(req.body?.email), str(req.body?.phone)]);
    let result = await this.consume(key, policy.limit, policy.windowMs);
    const account = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (result.ok && account && isLoginPath(path)) result = await this.consume(rateLimitKey(["acct", account]), LOGIN_ACCOUNT_RATE.limit, LOGIN_ACCOUNT_RATE.windowMs);
    if (!result.ok) {
      throw new HttpException(
        { message: "Too many requests", code: "RATE_LIMITED", retryAfterSec: result.retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
