import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { authRatePolicy, consumeRateLimit, rateLimitKey } from "./rate-limit";

function clientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

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
    const result = consumeRateLimit(key, policy.limit, policy.windowMs);
    if (!result.ok) {
      throw new HttpException(
        { message: "Too many requests", code: "RATE_LIMITED", retryAfterSec: result.retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
