import assert from "node:assert/strict";
import { FiscalSubmissionStatus, RevenueStatus } from "@prisma/client";
import { test } from "node:test";
import { reducePostedRevenueNetWithFiscal, submissionVoidFiscalAction } from "./void-revenue-fiscal-returns";

test("submissionVoidFiscalAction maps ETA submission states", () => {
  assert.equal(submissionVoidFiscalAction(undefined), "none");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.PENDING), "cancel_pending");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.SUBMITTING), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.SUBMITTED), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.ACCEPTED), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.REJECTED), "return_already_rejected");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.CANCELLED), "return_already_rejected");
});

test("reducePostedRevenueNetWithFiscal re-queues a pending 400 sale at 300 without leaving revenue unreceipted", async () => {
  let fiscalQueueCalls = 0;
  let docDeleted = false;
  let updatedNet = 0;

  const tx = {
    revenueEntry: {
      findFirst: async () => ({
        id: "rev-1",
        netAmount: 400,
        grossAmount: 400,
        currency: "EGP",
        clinicId: "c1",
        description: "Visit fee",
        collectionMode: "CASH_ON_VISIT",
        transferChannel: null,
        transferReference: null,
        status: RevenueStatus.POSTED,
        fiscalDocument: {
          id: "doc-1",
          patientId: "p1",
          submission: { status: FiscalSubmissionStatus.PENDING },
        },
      }),
      update: async ({ data }: { data: { netAmount?: { toString: () => string } } }) => {
        updatedNet = Number(data.netAmount?.toString?.() ?? data.netAmount);
        return { id: "rev-1" };
      },
    },
    $queryRaw: async () => [{ id: "sub-1" }],
    fiscalSubmission: {
      findFirst: async (args: { where?: { fiscalDocumentId?: string; idempotencyKey?: string } }) => {
        if (args.where?.fiscalDocumentId) {
          return { id: "sub-1", status: FiscalSubmissionStatus.PENDING };
        }
        return null;
      },
      update: async () => ({ id: "sub-1" }),
      create: async () => {
        fiscalQueueCalls += 1;
        return { id: "sub-new" };
      },
    },
    fiscalDocument: {
      delete: async () => {
        docDeleted = true;
      },
      findFirst: async () => null,
      create: async () => ({ id: "doc-new" }),
    },
    tenant: {
      findUnique: async () => ({
        providerSettings: null,
        baseCurrency: "EGP",
        market: {
          code: "EG",
          defaultCurrency: "EGP",
          defaultTimezone: "Africa/Cairo",
          defaultPhoneRegion: "EG",
          dataRegion: "eg",
          hostCell: "eg",
          weekendDays: [5, 6],
          taxConfig: { fiscalProvider: "eta_egypt" },
          providerConfig: {},
          paymentMethods: [],
          featureFlags: [],
          featureDefaults: null,
        },
        tenantFeatureFlags: [],
        whatsAppRemindersEnabled: false,
      }),
    },
    clinic: {
      findFirst: async () => ({
        taxRegistrationNumber: "707597870",
        invoiceVatPercent: 0,
        providerSettings: null,
        tenantId: "t1",
      }),
    },
    featureFlag: {
      findFirst: async () => ({ enabled: true }),
      findMany: async () => [{ key: "eta_receipts", enabled: true }],
    },
    marketFeatureFlag: { findMany: async () => [] },
    tenantFeatureFlag: { findMany: async () => [{ enabled: true }] },
    tenantPaymentChannel: { findMany: async () => [] },
    patient: { findFirst: async () => ({ firstNameEn: "A", lastNameEn: "B" }) },
    encounter: { findFirst: async () => null },
    appointment: { findFirst: async () => null },
    operation: { findFirst: async () => null },
    integrationFailureLog: { create: async () => ({ id: "log" }) },
    fiscalDevice: {
      findFirst: async () => ({
        id: "dev-1",
        serialNumber: "SN1",
        status: "ACTIVE",
        credential: { clientId: "x", clientSecret: "y" },
      }),
    },
    $executeRaw: async () => 0,
  };

  await reducePostedRevenueNetWithFiscal(
    tx as never,
    "t1",
    "rev-1",
    300,
    {
      tenantId: "t1",
      clinicId: "c1",
      patientId: "p1",
      description: "Visit fee",
      currency: "EGP",
      collectionMode: "CASH_ON_VISIT" as never,
      transferChannel: null,
      transferReference: null,
    },
    "Fee adjustment",
  );

  assert.equal(updatedNet, 300);
  assert.equal(docDeleted, true);
  assert.equal(fiscalQueueCalls, 1);
});