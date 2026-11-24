import { devAuthHelpersEnabled } from "../common/http-hardening";
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MarketsService } from "../markets/markets.service";
import { sendWhatsAppMessage } from "../messaging/whatsapp.provider";
import { normalizeSignupPhone, SIGNUP_OTP_PURPOSE } from "./signup-phone";

const OTP_TTL_MS = 10 * 60_000;
const MAX_OTP_PER_PHONE_HOUR = 5;
const MAX_OTP_PER_IP_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;

const ipOtpTimestamps = new Map<string, number[]>();

type SignupTokenClaims = {
  typ: "signup";
  phone: string;
  marketId: string;
  challengeId: string;
};

@Injectable()
export class SignupOtpService {
  private readonly logger = new Logger(SignupOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private devOtpCode(): string | null {
    if (!devAuthHelpersEnabled()) return null; // a stray SIGNUP_OTP_DEV_CODE must never become a production master OTP
    const raw = this.config.get<string>("SIGNUP_OTP_DEV_CODE")?.trim();
    return raw && raw.length >= 4 ? raw : null;
  }

  private ipBucketKey(ip: string): string {
    return createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 32);
  }

  private async assertRateLimits(phone: string, clientIp?: string): Promise<void> {
    const since = new Date(Date.now() - 3_600_000);
    const phoneCount = await this.prisma.otpChallenge.count({
      where: { phone, purpose: SIGNUP_OTP_PURPOSE, createdAt: { gte: since } },
    });
    if (phoneCount >= MAX_OTP_PER_PHONE_HOUR) {
      throw new HttpException("Too many verification codes for this number. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (clientIp) {
      const key = this.ipBucketKey(clientIp);
      const windowStart = Date.now() - 3_600_000;
      const prior = (ipOtpTimestamps.get(key) ?? []).filter((t) => t >= windowStart);
      if (prior.length >= MAX_OTP_PER_IP_HOUR) {
        throw new HttpException("Too many requests from this network. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  async sendOtp(body: { phone: string; market: string }, clientIp?: string) {
    const marketCode = body.market?.trim();
    if (!marketCode) throw new BadRequestException("market is required");

    const marketRow = await this.prisma.market.findFirst({ where: { code: marketCode.toUpperCase() } });
    if (!marketRow) throw new BadRequestException("Unknown market");
    await this.markets.assertMarketForNewTenant(marketRow.id);

    const calling = marketRow.defaultPhoneRegion?.replace(/\D/g, "") || "20";
    const phone = normalizeSignupPhone(body.phone, calling);

    await this.assertRateLimits(phone, clientIp);

    const devCode = this.devOtpCode();
    const code = devCode ?? String(randomInt(100_000, 999_999));
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        phone,
        purpose: SIGNUP_OTP_PURPOSE,
        codeHash,
        expiresAt,
      },
    });

    if (clientIp) {
      const key = this.ipBucketKey(clientIp);
      const list = ipOtpTimestamps.get(key) ?? [];
      list.push(Date.now());
      ipOtpTimestamps.set(key, list);
    }

    const message = `Kiorly signup code: ${code}`;
    const wa = await sendWhatsAppMessage(phone, message);
    if (!wa.ok) {
      this.logger.warn(`WhatsApp OTP failed for ${phone.slice(0, 6)}…: ${wa.error}; SMS fallback not configured`);
    }

    return {
      ok: true as const,
      expiresAt: expiresAt.toISOString(),
      channel: wa.ok ? ("whatsapp" as const) : ("sms_pending" as const),
      ...(devCode ? { devHint: "SIGNUP_OTP_DEV_CODE is set" } : {}),
    };
  }

  async verifyOtp(body: { phone: string; code: string; market: string }) {
    const marketRow = await this.prisma.market.findFirst({ where: { code: body.market?.trim().toUpperCase() } });
    if (!marketRow) throw new BadRequestException("Unknown market");
    const calling = marketRow.defaultPhoneRegion?.replace(/\D/g, "") || "20";
    const phone = normalizeSignupPhone(body.phone, calling);
    const code = body.code?.trim();
    if (!code) throw new BadRequestException("code is required");

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose: SIGNUP_OTP_PURPOSE,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new BadRequestException("No active verification code");

    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpException("Too many incorrect attempts", HttpStatus.TOO_MANY_REQUESTS);
    }

    const devCode = this.devOtpCode();
    const ok =
      (devCode != null && code === devCode) || (await bcrypt.compare(code, challenge.codeHash));
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Incorrect code");
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const signupToken = this.jwt.sign(
      {
        typ: "signup",
        phone,
        marketId: marketRow.id,
        challengeId: challenge.id,
      } satisfies SignupTokenClaims,
      { expiresIn: "30m" },
    );

    return { signupToken, phone, market: marketRow.code };
  }

  decodeSignupToken(signupToken: string): SignupTokenClaims {
    let payload: unknown;
    try {
      payload = this.jwt.verify(signupToken);
    } catch {
      throw new BadRequestException("Invalid or expired signup token");
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      (payload as SignupTokenClaims).typ !== "signup" ||
      typeof (payload as SignupTokenClaims).phone !== "string" ||
      typeof (payload as SignupTokenClaims).marketId !== "string" ||
      typeof (payload as SignupTokenClaims).challengeId !== "string"
    ) {
      throw new BadRequestException("Invalid signup token");
    }
    return payload as SignupTokenClaims;
  }
}