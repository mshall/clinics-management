import {
  EncounterStatus,
  Prisma,
  RevenueStatus,
  type TransferVerificationStatus,
  VisitCollectionMode,
} from "@prisma/client";
import { isBaseCurrency } from "./base-currencies";
import { resolveClinicCurrency } from "./clinic-currency";
import type { ParsedVisitCollection } from "./visit-collection";
import { postRevenueWithFiscal } from "../compliance/post-revenue-with-fiscal";
import {
  queuePartialFiscalReturnForPostedRevenue,
  voidPostedRevenuesWithFiscalReturns,
} from "../compliance/void-revenue-fiscal-returns";

const VISIT_CHARGE_CATEGORIES = ["VISIT", "VISIT_FEE"] as const;
const BALANCE_DUE_PHRASE = "balance due";

function isCollectedVisitFee(row: { collectionMode: VisitCollectionMode | null; grossAmount: unknown }) {
  return row.collectionMode != null && Number(row.grossAmount) > 0;
}

function isBalanceDueRow(row: { collectionMode: VisitCollectionMode | null; description: string | null }) {
  return row.collectionMode == null && (row.description?.toLowerCase().includes(BALANCE_DUE_PHRASE) ?? false);
}

async function findPostedAppointmentVisitCharge(
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

async function listPostedEncounterVisitFees(tx: Prisma.TransactionClient, tenantId: string, encounterId: string) {
  return tx.revenueEntry.findMany({
    where: { tenantId, encounterId, category: "VISIT_FEE", status: RevenueStatus.POSTED },
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
  const rows = await listPostedEncounterVisitFees(tx, params.tenantId, params.encounterId);
  const balanceRow = rows.find(isBalanceDueRow);

  if (params.balanceAmount <= 0.001) {
    if (balanceRow) {
      await voidPostedRevenuesWithFiscalReturns(
        tx,
        params.tenantId,
        { id: balanceRow.id },
        "Return",
      );
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
      },
    });
    return;
  }

  await postRevenueWithFiscal(tx, {
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
    skipFiscalQueue: true,
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
    collectedRowId: string;
    paidAmount: number;
    targetAmount: number;
    clinicTaxRin?: string | null;
    vatPercent?: number;
  },
): Promise<void> {
  const { paidAmount, targetAmount } = params;

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
    const refund = paidAmount - targetAmount;
    await queuePartialFiscalReturnForPostedRevenue(
      tx,
      params.tenantId,
      params.collectedRowId,
      refund,
      "Partial return",
    );
    await tx.revenueEntry.update({
      where: { id: params.collectedRowId },
      data: {
        grossAmount: new Prisma.Decimal(String(targetAmount)),
        netAmount: new Prisma.Decimal(String(targetAmount)),
      },
    });
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

  let encounterRows = await listPostedEncounterVisitFees(tx, tenantId, encounterId);

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
      encounterRows = await listPostedEncounterVisitFees(tx, tenantId, encounterId);
      if (encounterRows.length === 0) {
        encounterRows = [aptCharge];
      }
    }
  }

  const collectedRow =
    encounterRows.find(isCollectedVisitFee) ??
  encounterRows.find((r) => !isBalanceDueRow(r) && Number(r.grossAmount) > 0);

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
      collectedRowId: collectedRow.id,
      paidAmount: paid,
      targetAmount: amount,
      clinicTaxRin: params.clinicTaxRin,
      vatPercent: params.vatPercent,
    });
    return;
  }

  const uncollapsedPrimary = collectedRow ?? encounterRows.find((r) => !isBalanceDueRow(r));

  if (uncollapsedPrimary && Math.abs(Number(uncollapsedPrimary.grossAmount) - amount) <= 0.001) {
    return;
  }

  if (uncollapsedPrimary && Math.abs(Number(uncollapsedPrimary.grossAmount) - amount) > 0.001) {
    await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { id: uncollapsedPrimary.id }, "Return");
    for (const bal of encounterRows.filter(isBalanceDueRow)) {
      await voidPostedRevenuesWithFiscalReturns(tx, tenantId, { id: bal.id }, "Return");
    }
  }

  const parsedCollection = params.collection?.collectionMode ? params.collection : undefined;

  await postRevenueWithFiscal(tx, {
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