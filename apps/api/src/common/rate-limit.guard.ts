import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { clientIpOf } from "./http-hardening";
import { authRatePolicy, consumeRateLimit, isLoginPath, LOGIN_ACCOUNT_RATE, rateLimitKey } from "./rate-limit";

const clientIp = clientIpOf; // TRUSTED_PROXY_HOPS-aware (the leftmost X-Forwarded-For entry is attacker-controlled)

@Injectable()
export class PublicAuthRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
    const key = rateLimitKey(["auth", path, ip, req.body?.email, req.body?.phone]);
    let result = consumeRateLimit(key, policy.limit, policy.windowMs);
    const account = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (result.ok && account && isLoginPath(path)) result = consumeRateLimit(rateLimitKey(["acct", account]), LOGIN_ACCOUNT_RATE.limit, LOGIN_ACCOUNT_RATE.windowMs);
    if (!result.ok) {
      throw new HttpException(
        { message: "Too many requests", code: "RATE_LIMITED", retryAfterSec: result.retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
