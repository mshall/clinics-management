import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of clean) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, "0");
}

function totpForSecret(secretBase32: string, atMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(atMs / 1000 / stepSec);
  return hotp(base32Decode(secretBase32), counter);
}

export function verifyTotpCode(secretBase32: string | null | undefined, token: string): boolean {
  if (!secretBase32?.trim() || !token?.trim()) return false;
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  const stepMs = 30_000;
  for (let drift = -1; drift <= 1; drift += 1) {
    if (totpForSecret(secretBase32, now + drift * stepMs) === normalized) return true;
  }
  return false;
}

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  beginSetup(userId: string, tenantId: string | null, email: string) {
    const secret = base32Encode(randomBytes(20));
    const issuer = process.env.MFA_TOTP_ISSUER?.trim() || "Kiorly Clinics";
    const label = encodeURIComponent(`${issuer}:${email}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
    return { secret, otpauthUrl, pending: true as const };
  }

  async confirmSetup(
    userId: string,
    tenantId: string | null,
    secret: string,
    code: string,
  ): Promise<{ ok: true }> {
    if (!verifyTotpCode(secret, code)) {
      throw new BadRequestException("Invalid authenticator code");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaTotpSecret: secret, mfaEnabled: true },
    });
    return { ok: true };
  }

  async disable(userId: string, tenantId: string | null, password: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { passwordHash: true, mfaTotpSecret: true, mfaEnabled: true },
    });
    if (!user?.mfaEnabled) throw new BadRequestException("MFA is not enabled");
    if (!bcrypt.compareSync(password, user.passwordHash)) {
      throw new BadRequestException("Password is incorrect");
    }
    if (!verifyTotpCode(user.mfaTotpSecret, code)) {
      throw new BadRequestException("Invalid authenticator code");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaTotpSecret: null },
    });
    return { ok: true as const };
  }
}