import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { effectiveRoles } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";
import { AuthOtpChallengeService } from "./auth-otp-challenge.service";
import { OTP_PURPOSE_LOGIN } from "./otp-purposes";
import { AuthService, type LoginSessionMeta } from "./auth.service";

@Injectable()
export class AuthOtpLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: AuthOtpChallengeService,
    private readonly auth: AuthService,
  ) {}

  private async resolvePhysicianUserId(phone: string): Promise<string> {
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, userId: { not: null } },
      select: { userId: true, phone: true },
      take: 5000,
    });
    const digits = this.otp.normalizePhone(phone);
    const match = employees.find((e) => this.otp.normalizePhone(e.phone) === digits);
    if (!match?.userId) throw new BadRequestException("No physician account for this number");

    const user = await this.prisma.user.findFirst({
      where: { id: match.userId, deletedAt: null, deactivatedAt: null },
      select: { id: true, role: true, additionalRoles: true },
    });
    if (!user) throw new BadRequestException("No physician account for this number");
    const roles = effectiveRoles(user);
    if (!roles.includes(UserRole.PHYSICIAN)) {
      throw new ForbiddenException("Phone login is available for physicians only");
    }
    return user.id;
  }

  async request(phone: string, clientIp?: string) {
    const normalized = this.otp.normalizePhone(phone);
    await this.resolvePhysicianUserId(normalized);
    await this.otp.sendOtp(normalized, OTP_PURPOSE_LOGIN, clientIp);
    return { ok: true as const };
  }

  async verify(phone: string, code: string, mfaCode: string | undefined, meta: LoginSessionMeta) {
    const normalized = this.otp.normalizePhone(phone);
    await this.otp.verifyOtp(normalized, code.trim(), OTP_PURPOSE_LOGIN);
    const userId = await this.resolvePhysicianUserId(normalized);
    return this.auth.issueLoginSession(userId, mfaCode, meta);
  }
}