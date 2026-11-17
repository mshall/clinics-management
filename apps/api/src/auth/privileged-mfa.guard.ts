import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "./jwt-user";
import { principalRequiresMfaEnrollment } from "./privileged-mfa";
import { privilegedMfaEnforced } from "./privileged-mfa-enforcement";

@Injectable()
export class PrivilegedMfaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: JwtUser; path?: string; url?: string; route?: { path?: string } }>();
    const user = req.user;
    if (!user?.userId) return true;

    if (!privilegedMfaEnforced()) return true;
    if (!principalRequiresMfaEnrollment(user)) return true;

    const path = (req.route?.path ?? req.path ?? req.url ?? "").split("?")[0] ?? "";
    if (
      /^\/api\/v1\/auth\/mfa\//.test(path) ||
      path === "/api/v1/auth/me" ||
      path.startsWith("/api/v1/auth/me/")
    ) {
      return true;
    }

    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, deletedAt: null },
      select: { mfaEnabled: true },
    });
    if (row?.mfaEnabled) return true;

    throw new UnauthorizedException({
      message: "Multi-factor authentication must be enabled for this role before using the application",
      errorCode: "MFA_SETUP_REQUIRED",
    });
  }
}