import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { SalesKitService } from "./sales-kit.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const kit = new SalesKitService(prismaSvc);

describe("GT-05 sales kit demo reset", () => {
  let platform: JwtUser;
  const prevAllow = process.env.ALLOW_DEMO_RESET;

  before(async () => {
    await prisma.$connect();
    process.env.ALLOW_DEMO_RESET = "true";
    const row = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(row);
    platform = {
      userId: row.id,
      tenantId: null,
      email: row.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };
  });

  after(async () => {
    if (prevAllow === undefined) delete process.env.ALLOW_DEMO_RESET;
    else process.env.ALLOW_DEMO_RESET = prevAllow;
    await prisma.$disconnect();
  });

  it("demo reset completes in under 60 seconds", async () => {
    const out = await kit.resetDemo(platform, { tier: "lite" });
    assert.ok(out.elapsedMs < 60_000, `reset took ${out.elapsedMs}ms`);
    assert.ok(out.results.length >= 1);
    assert.equal(out.results[0].tier, "lite");
    assert.ok(out.results[0].patients >= 3);
  });

  it("builds QR signup assets for a rep code", async () => {
    const assets = await kit.repSignupAssets("DEMO-REP", "https://app.kiorly.test");
    assert.equal(assets.salesRepCode, "DEMO-REP");
    assert.match(assets.signupUrl, /rep=DEMO-REP/);
    assert.match(assets.qrDataUrl, /^data:image\/png;base64,/);
  });
});
