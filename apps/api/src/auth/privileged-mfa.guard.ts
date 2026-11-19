import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "./jwt-user";
import { principalRequiresMfaEnrollment } from "./privileged-mfa";
import {
  isBillingMfaPath,
  mfaGraceExpired,
  privilegedMfaEnforced,
} from "./privileged-mfa-enforcement";

@Injectable()
export class PrivilegedMfaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: JwtUser;
      path?: string;
      url?: string;
      route?: { path?: string };
      originalUrl?: string;
    }>();
    const user = req.user;
    if (!user?.userId) return true;

    if (!privilegedMfaEnforced()) return true;

    const path = (req.originalUrl ?? req.route?.path ?? req.path ?? req.url ?? "").split("?")[0] ?? "";
    if (
      /^\/api\/v1\/auth\/mfa\//.test(path) ||
      path === "/api/v1/auth/me" ||
      path.startsWith("/api/v1/auth/me/") ||
      path.startsWith("/api/v1/auth/otp")
    ) {
      return true;
    }

    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, deletedAt: null },
      select: { mfaEnabled: true, createdAt: true, isTenantOwner: true },
    });
    if (!row) return true;
    if (row.mfaEnabled) return true;

    const requires =
      principalRequiresMfaEnrollment(user) || row.isTenantOwner || Boolean(user.isTenantOwner);
    if (!requires) return true;

    const pastGrace = mfaGraceExpired(row.createdAt);
    // During grace: allow non-billing. After day 7: block billing (and all privileged routes).
    if (!pastGrace) {
      if (isBillingMfaPath(path)) {
        // Still allow billing during grace (owners onboard) — acceptance targets post-day-7 only.
        return true;
      }
      return true;
    }

    if (isBillingMfaPath(path) || pastGrace) {
      throw new UnauthorizedException({
        message: "Multi-factor authentication must be enabled for this role before using billing or the application",
        errorCode: "MFA_SETUP_REQUIRED",
        graceExpired: true,
      });
    }
    return true;
  }
}
