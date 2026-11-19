import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../messaging/email.service";
import { AuthOtpChallengeService } from "./auth-otp-challenge.service";
import { OTP_PURPOSE_PASSWORD_RESET } from "./otp-purposes";
import { normalizeLoginEmail, loginEmailLookupVariants } from "./auth-email.util";
import { AuthSessionService } from "./auth-session.service";

const RESET_TTL_MS = 30 * 60_000;

@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: AuthOtpChallengeService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService,
    @Optional() private readonly email?: EmailService,
  ) {}

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private webBaseUrl(): string {
    return (
      this.config.get<string>("APP_WEB_URL")?.trim() ||
      this.config.get<string>("WEB_APP_URL")?.trim() ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  async forgot(body: { email?: string; phone?: string }, clientIp?: string) {
    if (body.phone?.trim()) {
      const phone = this.otp.normalizePhone(body.phone);
      await this.otp.sendOtp(phone, OTP_PURPOSE_PASSWORD_RESET, clientIp);
      return { ok: true as const, channel: "whatsapp" as const };
    }

    const emailRaw = body.email?.trim();
    if (!emailRaw) throw new BadRequestException("email or phone is required");

    const normalized = normalizeLoginEmail(emailRaw);
    const variants = loginEmailLookupVariants(normalized);
    const user = await this.prisma.user.findFirst({
      where: { email: { in: variants }, deletedAt: null, deactivatedAt: null },
      select: { id: true, email: true },
    });

    if (user) {
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = this.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      const link = `${this.webBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
      if (this.email) {
        const sent = await this.email.send({
          tenantId: null,
          to: user.email,
          templateKey: "password_reset",
          locale: "both",
          variables: { resetLink: link },
          tags: { topic: "auth.password_reset" },
        });
        if (!sent.ok) {
          this.logger.warn(`Password reset email failed for ${user.email}: ${sent.error}`);
        }
      } else {
        this.logger.log(`Password reset link for ${user.email}: ${link}`);
      }
      if (this.config.get<string>("AUTH_RESET_DEV_EXPOSE") === "1") {
        return { ok: true as const, channel: "email" as const, devResetLink: link };
      }
    }

    return { ok: true as const, channel: "email" as const };
  }

  async reset(body: { token?: string; phone?: string; code?: string; newPassword: string }) {
    const password = body.newPassword;
    if (!password || password.length < 8) throw new BadRequestException("Password must be at least 8 characters");

    let userId: string | null = null;

    if (body.token?.trim()) {
      const hash = this.hashToken(body.token.trim());
      const row = await this.prisma.passwordResetToken.findFirst({
        where: {
          tokenHash: hash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!row) throw new BadRequestException("Invalid or expired reset link");
      userId = row.userId;
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.update({
          where: { id: row.id },
          data: { consumedAt: new Date() },
        }),
        this.prisma.passwordResetToken.updateMany({
          where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
          data: { consumedAt: new Date() },
        }),
      ]);
    } else if (body.phone?.trim() && body.code?.trim()) {
      const phone = this.otp.normalizePhone(body.phone);
      await this.otp.verifyOtp(phone, body.code.trim(), OTP_PURPOSE_PASSWORD_RESET);
      const employee = await this.prisma.employee.findFirst({
        where: { phone, deletedAt: null, userId: { not: null } },
        select: { userId: true },
      });
      if (!employee?.userId) throw new BadRequestException("No account for this number");
      userId = employee.userId;
    } else {
      throw new BadRequestException("Provide token or phone with verification code");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId!, deletedAt: null, deactivatedAt: null },
    });
    if (!user) throw new BadRequestException("Account not found");

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(password, 10) },
    });
    await this.sessions.revokeAllSessions(user.id);
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (this.email && user.email) {
      await this.email
        .send({
          tenantId: user.tenantId,
          to: user.email,
          templateKey: "security_alert",
          locale: "both",
          variables: {
            event: "password_changed",
            detail: "All sessions were revoked. If you did not do this, contact support.",
          },
          tags: { topic: "auth.security_alert" },
        })
        .catch((e) => this.logger.warn(`security email failed: ${e instanceof Error ? e.message : String(e)}`));
    }

    return { ok: true as const };
  }
}