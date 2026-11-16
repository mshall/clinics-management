import assert from "node:assert/strict";
import test from "node:test";
import { RevenueStatus } from "@prisma/client";
import { upsertEncounterVisitFeeRevenue } from "./visit-fee-ledger";

test("check-in VISIT payment is linked on encounter save without a second POSTED row", async () => {
  const checkInRow = {
    id: "rev-checkin",
    grossAmount: 200,
    netAmount: 200,
    currency: "EGP",
    description: "Check-in payment",
    encounterId: null as string | null,
    collectionMode: null,
    transferChannel: null,
    transferReference: null,
  };

  const revenueCreates: unknown[] = [];
  const revenueUpdates: { id: string; data: unknown }[] = [];

  const tx = {
    revenueEntry: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        if (w.encounterId === "enc-1" && w.category === "VISIT_FEE") return null;
        if (w.appointmentId === "apt-1") return checkInRow;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
        revenueUpdates.push({ id: where.id, data });
        return { id: where.id };
      },
      create: async (args: { data: unknown }) => {
        revenueCreates.push(args.data);
        return { id: "rev-new" };
      },
    },
    patient: {
      findFirst: async () => ({ firstNameEn: "Ada", lastNameEn: "Lovelace" }),
    },
    clinic: {
      findFirst: async () => ({ defaultCurrency: "EGP", tenant: { baseCurrency: "EGP" } }),
    },
    tenant: { findUnique: async () => ({ baseCurrency: "EGP" }) },
    fiscalDocument: { findFirst: async () => null },
    fiscalSubmission: { findFirst: async () => null },
    tenantPaymentChannel: { findMany: async () => [] },
    encounter: { findFirst: async () => null },
    appointment: { findFirst: async () => null },
    operation: { findFirst: async () => null },
    featureFlag: { findFirst: async () => null },
    marketFeatureFlag: { findMany: async () => [] },
    tenantFeatureFlag: { findMany: async () => [] },
  };

  await upsertEncounterVisitFeeRevenue(tx as never, {
    tenantId: "t1",
    clinicId: "c1",
    encounterId: "enc-1",
    appointmentId: "apt-1",
    amount: 200,
    patientId: "p1",
    vatPercent: 0,
  });

  assert.equal(revenueCreates.length, 0, "should not create duplicate revenue");
  assert.equal(revenueUpdates.length, 1);
  assert.equal(revenueUpdates[0]?.id, "rev-checkin");
  const data = revenueUpdates[0]?.data as { encounterId?: string; category?: string; status?: string };
  assert.equal(data.encounterId, "enc-1");
  assert.equal(data.category, "VISIT_FEE");
  assert.notEqual(data.status, RevenueStatus.VOID);
});

test("adopt path does not queue a second fiscal submission", async () => {
  const checkInRow = {
    id: "rev-checkin",
    grossAmount: 150,
    netAmount: 150,
    currency: "EGP",
    description: "Check-in payment",
    encounterId: null as string | null,
    collectionMode: null,
    transferChannel: null,
    transferReference: null,
  };

  let fiscalCreates = 0;

  const tx = {
    revenueEntry: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        if (w.encounterId === "enc-1" && w.category === "VISIT_FEE") return null;
        if (w.appointmentId === "apt-1") return checkInRow;
        return null;
      },
      update: async ({ where }: { where: { id: string }; data: unknown }) => ({ id: where.id }),
      create: async () => {
        throw new Error("should not create revenue on adopt");
      },
    },
    patient: {
      findFirst: async () => ({ firstNameEn: "A", lastNameEn: "B" }),
    },
    clinic: {
      findFirst: async () => ({ defaultCurrency: "EGP", tenant: { baseCurrency: "EGP" } }),
    },
    tenant: { findUnique: async () => ({ baseCurrency: "EGP" }) },
    fiscalDocument: { findFirst: async () => null },
    fiscalSubmission: {
      findFirst: async () => null,
      create: async () => {
        fiscalCreates += 1;
        return { id: "sub-1" };
      },
    },
    tenantPaymentChannel: { findMany: async () => [] },
    encounter: { findFirst: async () => null },
    appointment: { findFirst: async () => null },
    operation: { findFirst: async () => null },
    featureFlag: { findFirst: async () => null },
    marketFeatureFlag: { findMany: async () => [] },
    tenantFeatureFlag: { findMany: async () => [] },
  };

  await upsertEncounterVisitFeeRevenue(tx as never, {
    tenantId: "t1",
    clinicId: "c1",
    encounterId: "enc-1",
    appointmentId: "apt-1",
    amount: 150,
    patientId: "p1",
    vatPercent: 0,
  });

  assert.equal(fiscalCreates, 0);
});