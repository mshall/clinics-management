import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { sendWhatsAppMessage } from "../messaging/whatsapp.provider";
import { normalizePhoneDigits } from "../patients/patient-phone";

const OTP_TTL_MS = 10 * 60_000;
const MAX_OTP_PER_PHONE_HOUR = 5;
const MAX_OTP_PER_IP_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;

const ipOtpTimestamps = new Map<string, number[]>();

@Injectable()
export class AuthOtpChallengeService {
  private readonly logger = new Logger(AuthOtpChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  devOtpCode(): string | null {
    const raw = this.config.get<string>("SIGNUP_OTP_DEV_CODE")?.trim();
    return raw && raw.length >= 4 ? raw : null;
  }

  normalizePhone(raw: string, defaultCountryCallingCode = "20"): string {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException("Enter a valid mobile number");
    }
    let normalized = digits;
    if (normalized.startsWith("0")) {
      normalized = `${defaultCountryCallingCode}${normalized.slice(1)}`;
    }
    if (!normalized.startsWith(defaultCountryCallingCode) && normalized.length === 10) {
      normalized = `${defaultCountryCallingCode}${normalized}`;
    }
    return normalized;
  }

  ipBucketKey(ip: string): string {
    return createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 32);
  }

  private assertRateLimits(_phone: string, _purpose: string, clientIp?: string): void {
    const since = Date.now() - 3_600_000;
    if (clientIp) {
      const key = this.ipBucketKey(clientIp);
      const prior = (ipOtpTimestamps.get(key) ?? []).filter((t) => t >= since);
      if (prior.length >= MAX_OTP_PER_IP_HOUR) {
        throw new HttpException("Too many requests from this network. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  async assertPhoneRateLimit(phone: string, purpose: string): Promise<void> {
    const since = new Date(Date.now() - 3_600_000);
    const phoneCount = await this.prisma.otpChallenge.count({
      where: { phone, purpose, createdAt: { gte: since } },
    });
    if (phoneCount >= MAX_OTP_PER_PHONE_HOUR) {
      throw new HttpException("Too many verification codes for this number. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async sendOtp(phone: string, purpose: string, clientIp?: string): Promise<{ expiresAt: string }> {
    this.assertRateLimits(phone, purpose, clientIp);
    await this.assertPhoneRateLimit(phone, purpose);

    const devCode = this.devOtpCode();
    const code = devCode ?? String(randomInt(100_000, 999_999));
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpChallenge.create({
      data: { phone, purpose, codeHash, expiresAt },
    });

    if (clientIp) {
      const key = this.ipBucketKey(clientIp);
      const list = ipOtpTimestamps.get(key) ?? [];
      list.push(Date.now());
      ipOtpTimestamps.set(key, list);
    }

    const message = `Kiorly code: ${code}`;
    const wa = await sendWhatsAppMessage(phone, message);
    if (!wa.ok) {
      this.logger.warn(`WhatsApp OTP failed for ${phone.slice(0, 6)}…: ${wa.error}`);
    }

    return { expiresAt: expiresAt.toISOString() };
  }

  async verifyOtp(phone: string, code: string, purpose: string): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose,
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
  }
}