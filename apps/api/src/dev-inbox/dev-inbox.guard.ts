import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

/**
 * The dev inbox exposes rendered messages (OTP codes, patient text), so it is a development tool:
 * open in any non-production NODE_ENV; in production it does not exist (404) unless DEV_INBOX_ENABLED=1,
 * and then every call needs the shared `X-Dev-Inbox-Key` (DEV_INBOX_KEY).
 */
@Injectable()
export class DevInboxGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== "production") return true;
    if (process.env.DEV_INBOX_ENABLED !== "1") throw new NotFoundException();
    const key = process.env.DEV_INBOX_KEY?.trim();
    const sent = context.switchToHttp().getRequest<Request>().headers["x-dev-inbox-key"];
    if (!key || sent !== key) throw new UnauthorizedException("Dev inbox key required");
    return true;
  }
}
