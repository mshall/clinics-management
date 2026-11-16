import assert from "node:assert/strict";
import test from "node:test";
import { RevenueStatus, VisitCollectionMode } from "@prisma/client";
import { upsertEncounterVisitFeeRevenue } from "./visit-fee-ledger";

function baseTx(overrides: {
  findFirst?: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  findMany?: (args: { where: Record<string, unknown> }) => Promise<unknown[]>;
  update?: (args: { where: { id: string }; data: unknown }) => Promise<{ id: string }>;
  create?: (args: { data: unknown }) => Promise<{ id: string }>;
}) {
  let fiscalCreates = 0;
  const revenueCreates: unknown[] = [];
  const revenueUpdates: { id: string; data: unknown }[] = [];

  const tx = {
    revenueEntry: {
      findFirst: async (args: { where: Record<string, unknown> }) =>
        overrides.findFirst ? overrides.findFirst(args) : null,
      findMany: async (args: { where: Record<string, unknown> }) =>
        overrides.findMany ? overrides.findMany(args) : [],
      update: async (args: { where: { id: string }; data: unknown }) => {
        revenueUpdates.push({ id: args.where.id, data: args.data });
        return overrides.update ? overrides.update(args) : { id: args.where.id };
      },
      create: async (args: { data: unknown }) => {
        revenueCreates.push(args.data);
        return overrides.create ? overrides.create(args) : { id: "rev-new" };
      },
    },
    patient: { findFirst: async () => ({ firstNameEn: "Ada", lastNameEn: "Lovelace" }) },
    clinic: {
      findFirst: async () => ({
        defaultCurrency: "EGP",
        taxRegistrationNumber: "707597870",
        invoiceVatPercent: 0,
        tenant: { baseCurrency: "EGP" },
      }),
    },
    tenant: { findUnique: async () => ({ baseCurrency: "EGP", providerSettings: null }) },
    fiscalDocument: {
      findFirst: async () => null,
      delete: async () => undefined,
    },
    fiscalSubmission: {
      findFirst: async () => null,
      create: async () => {
        fiscalCreates += 1;
        return { id: "sub-1" };
      },
    },
    $queryRaw: async () => [],
    tenantPaymentChannel: { findMany: async () => [] },
    encounter: { findFirst: async () => null },
    appointment: { findFirst: async () => null },
    operation: { findFirst: async () => null },
    featureFlag: { findFirst: async () => null },
    marketFeatureFlag: { findMany: async () => [] },
    tenantFeatureFlag: { findMany: async () => [] },
    market: { findFirst: async () => null },
    integrationFailureLog: { create: async () => ({ id: "log" }) },
    $executeRaw: async () => 0,
  };

  return { tx, revenueCreates, revenueUpdates, get fiscalCreates() {
    return fiscalCreates;
  } };
}

test("check-in VISIT payment is linked on encounter save without a second POSTED row", async () => {
  const checkInRow = {
    id: "rev-checkin",
    grossAmount: 200,
    netAmount: 200,
    currency: "EGP",
    description: "Check-in payment",
    encounterId: null as string | null,
    collectionMode: VisitCollectionMode.CASH_ON_VISIT,
    transferChannel: null,
    transferReference: null,
  };

  const { tx, revenueCreates, revenueUpdates } = baseTx({
    findFirst: async (args) => {
      const w = args.where;
      if (w.encounterId === "enc-1" && w.category === "VISIT_FEE") return null;
      if (w.appointmentId === "apt-1") return checkInRow;
      return null;
    },
  });

  await upsertEncounterVisitFeeRevenue(tx as never, {
    tenantId: "t1",
    clinicId: "c1",
    encounterId: "enc-1",
    appointmentId: "apt-1",
    amount: 200,
    patientId: "p1",
    vatPercent: 0,
  });

  assert.equal(revenueCreates.length, 0);
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
    collectionMode: VisitCollectionMode.CASH_ON_VISIT,
    transferChannel: null,
    transferReference: null,
  };

  const { tx, fiscalCreates } = baseTx({
    findFirst: async (args) => {
      const w = args.where;
      if (w.encounterId === "enc-1" && w.category === "VISIT_FEE") return null;
      if (w.appointmentId === "apt-1") return checkInRow;
      return null;
    },
    create: async () => {
      throw new Error("should not create revenue on adopt");
    },
  });

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

test("fee increase after check-in posts balance due without a second collected sale", async () => {
  const collected = {
    id: "rev-paid",
    grossAmount: 300,
    netAmount: 300,
    currency: "EGP",
    description: "Check-in payment",
    encounterId: "enc-1",
    collectionMode: VisitCollectionMode.CASH_ON_VISIT,
    transferChannel: null,
    transferReference: null,
    category: "VISIT_FEE",
    status: RevenueStatus.POSTED,
    clinicId: "c1",
  };

  const { tx, revenueCreates, fiscalCreates } = baseTx({
    findFirst: async (args) => {
      const w = args.where;
      if (w.appointmentId === "apt-1") return collected;
      return null;
    },
    findMany: async (args) => {
      if (args.where.encounterId === "enc-1") return [collected];
      return [];
    },
  });

  await upsertEncounterVisitFeeRevenue(tx as never, {
    tenantId: "t1",
    clinicId: "c1",
    encounterId: "enc-1",
    appointmentId: "apt-1",
    amount: 400,
    patientId: "p1",
    collection: {
      collectionMode: VisitCollectionMode.CASH_ON_VISIT,
      transferChannel: null,
      transferReference: null,
    },
    vatPercent: 0,
  });

  assert.equal(fiscalCreates, 0, "should not queue a full new sale for the amended fee");
  assert.equal(revenueCreates.length, 1);
  const created = revenueCreates[0] as {
    grossAmount?: { toString: () => string };
    collectionMode?: unknown;
    description?: string;
  };
  assert.equal(created.grossAmount?.toString?.() ?? String(created.grossAmount), "100");
  assert.equal(created.collectionMode, undefined);
  assert.equal((created as { status?: string }).status, RevenueStatus.RECEIVABLE);
  assert.match(created.description ?? "", /balance due/i);
});