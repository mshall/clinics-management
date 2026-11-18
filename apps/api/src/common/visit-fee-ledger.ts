import {
  EncounterStatus,
  Prisma,
  RevenueStatus,
  type TransferVerificationStatus,
  VisitCollectionMode,
} from "@prisma/client";
import { isBaseCurrency } from "./base-currencies";
import { resolveClinicCurrency } from "./clinic-currency";
import { collectionFieldsFromParsed, type ParsedVisitCollection } from "./visit-collection";
import { postRevenue } from "../compliance/post-revenue";
import { reducePostedRevenueNetWithFiscal, voidPostedRevenuesWithFiscalReturns } from "../compliance/void-revenue-adjustments";

const VISIT_CHARGE_CATEGORIES = ["VISIT", "VISIT_FEE"] as const;

type LedgerRow = {
  id: string;
  grossAmount: unknown;
  status: RevenueStatus;
  collectionMode: VisitCollectionMode | null;
  description: string | null;
  currency: string;
  transferChannel: string | null;
  transferReference: string | null;
};

function isCollectedVisitFee(row: LedgerRow) {
  return row.status === RevenueStatus.POSTED && row.collectionMode != null && Number(row.grossAmount) > 0;
}

function isReceivableVisitBalance(row: LedgerRow) {
  return row.status === RevenueStatus.RECEIVABLE;
}

export async function findPostedAppointmentVisitCharge(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
) {
  return tx.revenueEntry.findFirst({
    where: {
      tenantId,
      appointmentId,
      status: RevenueStatus.POSTED,
      category: { in: [...VISIT_CHARGE_CATEGORIES] },
    },
    orderBy: { postedAt: "asc" },
  });
}

async function listEncounterVisitFeeLedgerRows(tx: Prisma.TransactionClient, tenantId: string, encounterId: string) {
  return tx.revenueEntry.findMany({
    where: {
      tenantId,
      encounterId,
      category: "VISIT_FEE",
      status: { in: [RevenueStatus.POSTED, RevenueStatus.RECEIVABLE] },
    },
    orderBy: { postedAt: "asc" },
  });
}

/** Links check-in VISIT payment to the encounter when amounts match; returns true if ledger is satisfied without a new sale. */
async function adoptAppointmentCheckInPayment(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    encounterId: string;
    appointmentId: string;
    amount: number;
  },
): Promise<boolean> {
  const aptCharge = await findPostedAppointmentVisitCharge(tx, params.tenantId, params.appointmentId);
  if (!aptCharge) return false;

  const paid = Number(aptCharge.grossAmount);
  if (paid <= 0) return false;

  const existingOnEncounter = await tx.revenueEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      encounterId: params.encounterId,
      category: "VISIT_FEE",
      status: RevenueStatus.POSTED,
    },
  });

  if (existingOnEncounter && existingOnEncounter.id !== aptCharge.id) {
    return false;
  }

  if (Math.abs(paid - params.amount) > 0.001) {
    return false;
  }

  if (!aptCharge.encounterId || aptCharge.encounterId !== params.encounterId) {
    await tx.revenueEntry.update({
      where: { id: aptCharge.id },
      data: {
        encounterId: params.encounterId,
        category: "VISIT_FEE",
        description:
          aptCharge.description ?? `Visit fee · encounter ${params.encounterId.slice(0, 8)}… (check-in payment)`,
      },
    });
  }

  return true;
}

async function upsertBalanceDueRow(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    appointmentId: string | null;
    patientId: string;
    currency: string;
    balanceAmount: number;
  },
): Promise<void> {
  const rows = await listEncounterVisitFeeLedgerRows(tx, params.tenantId, params.encounterId);
  const balanceRow = rows.find(isReceivableVisitBalance);

  if (params.balanceAmount <= 0.001) {
    if (balanceRow) {
      await voidPostedRevenuesWithFiscalReturns(tx, params.tenantId, { id: balanceRow.id }, "Return");
    }
    return;
  }

  if (balanceRow) {
    await tx.revenueEntry.update({
      where: { id: balanceRow.id },
      data: {
        grossAmount: new Prisma.Decimal(String(params.balanceAmount)),
        netAmount: new Prisma.Decimal(String(params.balanceAmount)),
        currency: params.currency,
        appointmentId: params.appointmentId,
        status: RevenueStatus.RECEIVABLE,
      },
    });
    return;
  }

  await postRevenue(tx, {
    tenantId: params.tenantId,
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    appointmentId: params.appointmentId ?? undefined,
    patientId: params.patientId,
    category: "VISIT_FEE",
    description: `Visit fee balance due · encounter ${params.encounterId.slice(0, 8)}…`,
    grossAmount: params.balanceAmount,
    netAmount: params.balanceAmount,
    taxAmount: 0,
    currency: params.currency,
    status: RevenueStatus.RECEIVABLE,
  });
}

async function amendCollectedVisitFee(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    appointmentId: string | null;
    patientId: string;
    currency: string;
    collectedRow: LedgerRow;
    paidAmount: number;
    targetAmount: number;
    clinicTaxRin?: string | null;
    vatPercent?: number;
  },
): Promise<void> {
  const { paidAmount, targetAmount, collectedRow } = params;

  if (targetAmount > paidAmount + 0.001) {
    const balance = targetAmount - paidAmount;
    await upsertBalanceDueRow(tx, {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      encounterId: params.encounterId,
      appointmentId: params.appointmentId,
      patientId: params.patientId,
      currency: params.currency,
      balanceAmount: balance,
    });
    return;
  }

  if (targetAmount < paidAmount - 0.001) {
    await reducePostedRevenueNetWithFiscal(
      tx,
      params.tenantId,
      collectedRow.id,
      targetAmount,
      {
        tenantId: params.tenantId,
        clinicId: params.clinicId,
        patientId: params.patientId,
        description: collectedRow.description ?? `Visit fee · encounter ${params.encounterId.slice(0, 8)}…`,
        currency: params.currency,
        vatPercent: params.vatPercent,
        clinicTaxRin: params.clinicTaxRin,
        collectionMode: collectedRow.collectionMode,
        transferChannel: collectedRow.transferChannel,
        transferReference: collectedRow.transferReference,
      },
      "Partial return",
    );
    await upsertBalanceDueRow(tx, {
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      encounterId: params.encounterId,
      appointmentId: params.appointmentId,
      patientId: params.patientId,
      currency: params.currency,
      balanceAmount: 0,
    });
    return;
  }

  await upsertBalanceDueRow(tx, {
    tenantId: params.tenantId,
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    appointmentId: params.appointmentId,
    patientId: params.patientId,
    currency: params.currency,
    balanceAmount: 0,
  });
}

export async function getEncounterVisitFeeReceivableSummary(
  db: Pick<Prisma.TransactionClient, "revenueEntry">,
  tenantId: string,
  encounterId: string,
): Promise<{ amount: number; currency: string; revenueEntryId: string } | null> {
  const row = await db.revenueEntry.findFirst({
    where: { tenantId, encounterId, category: "VISIT_FEE", status: RevenueStatus.RECEIVABLE },
    orderBy: { postedAt: "desc" },
  });
  if (!row || Number(row.netAmount) <= 0) return null;
  return {
    amount: Number(row.netAmount),
    currency: row.currency,
    revenueEntryId: row.id,
  };
}

export type TransferReceiptUpload = {
  relativePath: string;
  mimeType: string;
  originalFileName: string;
};

export async function collectEncounterVisitFeeBalance(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    encounterId: string;
    collection: ParsedVisitCollection;
    transferVerificationStatus?: TransferVerificationStatus;
    clinicTaxRin?: string | null;
    vatPercent?: number;
    transferReceipt?: TransferReceiptUpload | null;
  },
): Promise<{ revenueEntryId: string; amount: number }> {
  const encounter = await tx.encounter.findFirst({
    where: { id: params.encounterId, tenantId: params.tenantId },
    select: { id: true, clinicId: true, patientId: true },
  });
  if (!encounter) throw new Error("Encounter not found");

  const row = await tx.revenueEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      encounterId: params.encounterId,
      category: "VISIT_FEE",
      status: RevenueStatus.RECEIVABLE,
    },
  });
  if (!row) throw new Error("No visit fee balance due for this encounter");

  const amount = Number(row.netAmount);
  const collectionData = collectionFieldsFromParsed(params.collection);

  const patient = await tx.patient.findFirst({
    where: { id: encounter.patientId, tenantId: params.tenantId },
    select: { firstNameEn: true, lastNameEn: true },
  });
  const buyerName = patient ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim() || "Patient" : "Patient";

  const claimed = await tx.revenueEntry.updateMany({
    where: {
      id: row.id,
      tenantId: params.tenantId,
      status: RevenueStatus.RECEIVABLE,
    },
    data: {
      status: RevenueStatus.POSTED,
      ...collectionData,
      ...(params.transferVerificationStatus !== undefined
        ? { transferVerificationStatus: params.transferVerificationStatus }
        : {}),
      ...(params.transferReceipt
        ? {
            transferReceiptPath: params.transferReceipt.relativePath,
            transferReceiptMimeType: params.transferReceipt.mimeType,
            transferReceiptFileName: params.transferReceipt.originalFileName,
          }
        : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new Error("VISIT_BALANCE_ALREADY_COLLECTED");
  }

  const updated = await tx.revenueEntry.findFirstOrThrow({ where: { id: row.id, tenantId: params.tenantId } });

  const clinic = await tx.clinic.findFirst({
    where: { id: encounter.clinicId, tenantId: params.tenantId },
    select: { taxRegistrationNumber: true, invoiceVatPercent: true },
  });

  return { revenueEntryId: updated.id, amount };
}

export async function upsertEncounterVisitFeeRevenue(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    appointmentId: string | null;
    amount: number;
    currency?: string;
    collection?: ParsedVisitCollection;
    patientId: string;
    transferVerificationStatus?: TransferVerificationStatus;
    clinicTaxRin?: string | null;
    vatPercent?: number;
    /** Booking planned transfer — fee stays receivable until staff collects with receipt. */
    pendingTransferCollection?: boolean;
    scheduledTransferChannel?: string | null;
  },
): Promise<void> {
  const { tenantId, clinicId, encounterId, appointmentId, amount, currency: currencyOpt } = params;

  if (appointmentId && amount > 0) {
    const adopted = await adoptAppointmentCheckInPayment(tx, {
      tenantId,
      encounterId,
      appointmentId,
      amount,
    });
    if (adopted) return;
  }

  const currency =
    currencyOpt?.trim() && isBaseCurrency(currencyOpt.trim())
      ? currencyOpt.trim()
      : await resolveClinicCurrency(tx, tenantId, clinicId);

  let encounterRows = await listEncounterVisitFeeLedgerRows(tx, tenantId, encounterId);

  if (appointmentId && encounterRows.length === 0) {
    const aptCharge = await findPostedAppointmentVisitCharge(tx, tenantId, appointmentId);
    if (aptCharge && Number(aptCharge.grossAmount) > 0) {
      await tx.revenueEntry.update({
        where: { id: aptCharge.id },
        data: {
          encounterId,
          category: "VISIT_FEE",
          ...(aptCharge.description
            ? {}
            : {
                description: `Visit fee · encounter ${encounterId.slice(0, 8)}… (check-in payment)`,
              }),
        },
      });
      encounterRows = await listEncounterVisitFeeLedgerRows(tx, tenantId, encounterId);
    }
  }

  const collectedRow = encounterRows.find(isCollectedVisitFee);

  if (amount <= 0) {
    await voidPostedRevenuesWithFiscalReturns(
      tx,
      tenantId,
      { encounterId, category: "VISIT_FEE" },
      "Return",
    );
    return;
  }

  if (collectedRow && isCollectedVisitFee(collectedRow)) {
    const paid = Number(collectedRow.grossAmount);
    if (Math.abs(paid - amount) <= 0.001) {
      await upsertBalanceDueRow(tx, {
        tenantId,
        clinicId,
        encounterId,
        appointmentId,
        patientId: params.patientId,
        currency,
        balanceAmount: 0,
      });
      return;
    }
    await amendCollectedVisitFee(tx, {
      tenantId,
      clinicId,
      encounterId,
      appointmentId,
      patientId: params.patientId,
      currency,
      collectedRow,
      paidAmount: paid,
      targetAmount: amount,
      clinicTaxRin: params.clinicTaxRin,
      vatPercent: params.vatPercent,
    });
    return;
  }

  const uncollapsedPrimary = encounterRows.find(
    (r) => !isReceivableVisitBalance(r) && Number(r.grossAmount) > 0,
  );

  if (uncollapsedPrimary && Math.abs(Number(uncollapsedPrimary.grossAmount) - amount) <= 0.001) {
    return;
  }

  if (uncollapsedPrimary && Math.abs(Number(uncollapsedPrimary.grossAmount) - amount) > 0.001) {
    await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { id: uncollapsedPrimary.id }, "Return");
    for (const bal of encounterRows.filter(isReceivableVisitBalance)) {
      await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { id: bal.id }, "Return");
    }
  }

  if (params.pendingTransferCollection && amount > 0) {
    await upsertBalanceDueRow(tx, {
      tenantId,
      clinicId,
      encounterId,
      appointmentId,
      patientId: params.patientId,
      currency,
      balanceAmount: amount,
    });
    const balanceRow = (await listEncounterVisitFeeLedgerRows(tx, tenantId, encounterId)).find(isReceivableVisitBalance);
    if (balanceRow && params.scheduledTransferChannel?.trim()) {
      await tx.revenueEntry.update({
        where: { id: balanceRow.id },
        data: {
          collectionMode: VisitCollectionMode.MONEY_TRANSFER,
          transferChannel: params.scheduledTransferChannel.trim().toUpperCase(),
        },
      });
    }
    return;
  }

  const parsedCollection = params.collection?.collectionMode ? params.collection : undefined;

  await postRevenue(tx, {
    tenantId,
    clinicId,
    encounterId,
    appointmentId: appointmentId ?? undefined,
    patientId: params.patientId,
    category: "VISIT_FEE",
    description: `Visit fee · encounter ${encounterId.slice(0, 8)}…`,
    grossAmount: amount,
    netAmount: amount,
    taxAmount: 0,
    currency,
    clinicTaxRin: params.clinicTaxRin,
    vatPercent: params.vatPercent ?? 0,
    transferVerificationStatus: params.transferVerificationStatus,
    collectionMode: parsedCollection?.collectionMode ?? undefined,
    transferChannel: parsedCollection?.transferChannel,
    transferReference: parsedCollection?.transferReference,
  });
}

export async function syncOpenEncounterVisitFeeFromAppointment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
  feeAmount: number,
): Promise<void> {
  const encounter = await tx.encounter.findFirst({
    where: {
      tenantId,
      appointmentId,
      status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, clinicId: true, visitFeeCurrency: true, patientId: true },
  });
  if (!encounter) return;

  await tx.encounter.update({
    where: { id: encounter.id },
    data: { visitFeeAmount: new Prisma.Decimal(String(feeAmount)) },
  });
  await upsertEncounterVisitFeeRevenue(tx, {
    tenantId,
    clinicId: encounter.clinicId,
    encounterId: encounter.id,
    appointmentId,
    amount: feeAmount,
    currency: encounter.visitFeeCurrency,
    patientId: encounter.patientId,
  });
}