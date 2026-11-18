import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import {
  clearPdpcEgyptFilingsCache,
  filingIsInHand,
  isEgyptPdpcReadyForPaidLaunch,
  loadPdpcEgyptFilingsRegistry,
} from "./pdpc-egypt-filings";
import { assertEgyptPdpcPaidLaunchAllowed } from "./pdpc-egypt-launch-gate";

describe("SC-02 Egypt PDPC filings", () => {
  it("default registry blocks paid launch until filings in hand", () => {
    delete process.env.PDPC_EGYPT_FILINGS_PATH;
    clearPdpcEgyptFilingsCache();
    const reg = loadPdpcEgyptFilingsRegistry();
    assert.ok(reg.breachProcedure.adoptedAt);
    assert.ok(reg.recordsOfProcessing.publishedAt);
    assert.equal(isEgyptPdpcReadyForPaidLaunch(reg), false);
    assert.ok(reg.filings.some((f) => f.status === "pending"));
  });

  it("filed or approved counts as in hand", () => {
    assert.equal(filingIsInHand("filed"), true);
    assert.equal(filingIsInHand("approved"), true);
    assert.equal(filingIsInHand("pending"), false);
  });

  it("all filings filed + DPO registered allows paid launch", () => {
    const fixture = resolve(process.cwd(), "..", "..", "platform", "pdpc-egypt-filings.json");
    const prev = process.env.PDPC_EGYPT_FILINGS_PATH;
    process.env.PDPC_EGYPT_FILINGS_PATH = fixture;
    clearPdpcEgyptFilingsCache();
    const reg = loadPdpcEgyptFilingsRegistry();
    const readyReg = {
      ...reg,
      dpo: {
        ...reg.dpo,
        appointedAt: "2026-11-01",
        registeredWithPdpcAt: "2026-11-05",
        pdpcRegistrationRef: "DPO-TEST",
      },
      filings: reg.filings.map((f) => ({
        ...f,
        status: "filed" as const,
        filedAt: "2026-11-10",
        reference: `REF-${f.id}`,
      })),
    };
    assert.equal(isEgyptPdpcReadyForPaidLaunch(readyReg), true);
    if (prev !== undefined) process.env.PDPC_EGYPT_FILINGS_PATH = prev;
    else delete process.env.PDPC_EGYPT_FILINGS_PATH;
    clearPdpcEgyptFilingsCache();
  });

  it("launch gate skips non-EG tenants", async () => {
    delete process.env.PDPC_EGYPT_FILINGS_PATH;
    clearPdpcEgyptFilingsCache();
    const prisma = {
      tenant: {
        findUnique: async () => ({ market: { code: "AE" } }),
      },
    };
    await assert.doesNotReject(() =>
      assertEgyptPdpcPaidLaunchAllowed(prisma as never, "tenant-ae"),
    );
  });

  it("launch gate rejects EG tenant when filings pending", async () => {
    const prevBypass = process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    delete process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS;
    delete process.env.PDPC_EGYPT_FILINGS_PATH;
    clearPdpcEgyptFilingsCache();
    const prisma = {
      tenant: {
        findUnique: async () => ({ market: { code: "EG" } }),
      },
    };
    try {
      await assert.rejects(
        () => assertEgyptPdpcPaidLaunchAllowed(prisma as never, "tenant-eg"),
        (e: unknown) => e instanceof ForbiddenException,
      );
    } finally {
      if (prevBypass !== undefined) process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = prevBypass;
    }
  });
});