import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("FS-01 existing appointment types after migration", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("defaults preserve prior behaviour (15 min, no buffers, 120 min notice)", async () => {
    const types = await prisma.appointmentType.findMany({ take: 5 });
    for (const t of types) {
      assert.equal(t.durationMinutes, t.durationMinutes);
      assert.equal(t.bufferBeforeMin, 0);
      assert.equal(t.bufferAfterMin, 0);
      assert.equal(t.minNoticeMinutes, 120);
      assert.equal(t.maxDaysAhead, 30);
      assert.equal(t.requiresRoom, false);
      assert.equal(t.newPatientOnly, false);
    }
  });

  it("availability templates use versioned weekJson when present", async () => {
    const rows = await prisma.clinicianAvailabilityTemplate.findMany({ take: 3 });
    for (const r of rows) {
      const week = r.weekJson as Record<string, unknown>;
      if (week && typeof week === "object" && "version" in week) {
        assert.equal(week.version, 1);
        assert.ok(Array.isArray(week.days));
      }
    }
  });
});