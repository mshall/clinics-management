import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { ConfigService } from "@nestjs/config";
import { AuthPasswordResetService } from "./auth-password-reset.service";
import { AuthOtpChallengeService } from "./auth-otp-challenge.service";
import { AuthSessionService } from "./auth-session.service";
import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaClient();
const config = new ConfigService({ SIGNUP_OTP_DEV_CODE: "424242", AUTH_RESET_DEV_EXPOSE: "1" });
const otp = new AuthOtpChallengeService(prisma as unknown as PrismaService, config);
const sessions = new AuthSessionService(prisma as unknown as PrismaService);
const passwordReset = new AuthPasswordResetService(
  prisma as unknown as PrismaService,
  otp,
  sessions,
  config,
);

describe("ON-02 password reset and sessions", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("reset tokens are single-use", async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: "dr.ahmed@drahmedshall.com", deletedAt: null },
    });
    const raw = randomBytes(16).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });

    await passwordReset.reset({ token: raw, newPassword: "newpass8ok" });
    await assert.rejects(() => passwordReset.reset({ token: raw, newPassword: "another8ok" }));

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(bcrypt.compareSync("newpass8ok", reloaded.passwordHash));
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync("demo", 10) },
    });
  });

  it("rate limits OTP sends per phone", async () => {
    const phone = `20177${String(Date.now()).slice(-7)}`;
    const purpose = "LOGIN_TEST";
    for (let i = 0; i < 5; i += 1) {
      await otp.sendOtp(phone, purpose);
    }
    await assert.rejects(() => otp.sendOtp(phone, purpose));
  });
});