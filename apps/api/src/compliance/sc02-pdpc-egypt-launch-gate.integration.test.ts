import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertEgyptPdpcPaidLaunchAllowed } from "./pdpc-egypt-launch-gate";

config({ path: resolve(process.cwd(), ".env") });

describe("SC-02 PDPC paid launch gate", () => {
  const prisma = new PrismaClient();
  let tenantId: string;

  before(async () => {
    if (!process.env.DATABASE_URL?.trim()) return;
    await prisma.$connect();
    const tenant = await prisma.tenant.findFirst({
      where: { market: { code: "EG" } },
      select: { id: true },
    });
    if (tenant) tenantId = tenant.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("blocks EG paid activation when filings are pending", async (t) => {
    if (!process.env.DATABASE_URL?.trim() || !tenantId) {
      t.skip("DATABASE_URL or EG tenant not available");
      return;
    }
    const prev = process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    delete process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    await assert.rejects(
      () => assertEgyptPdpcPaidLaunchAllowed(prisma as unknown as PrismaService, tenantId),
      (e: unknown) => e instanceof ForbiddenException,
    );
    if (prev) process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = prev;
  });

  it("allows activate when bypass set for staging", async (t) => {
    if (!process.env.DATABASE_URL?.trim() || !tenantId) {
      t.skip("DATABASE_URL or EG tenant not available");
      return;
    }
    const prev = process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = "1";
    await assert.doesNotReject(() =>
      assertEgyptPdpcPaidLaunchAllowed(prisma as unknown as PrismaService, tenantId),
    );
    if (prev) process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = prev;
    else delete process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
  });

});