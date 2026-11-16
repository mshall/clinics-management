import { EncounterStatus, Prisma, RevenueStatus, type TransferVerificationStatus } from "@prisma/client";
import { isBaseCurrency } from "./base-currencies";
import { resolveClinicCurrency } from "./clinic-currency";
import { collectionFieldsFromParsed, type ParsedVisitCollection } from "./visit-collection";
import { queueEtaReceipt } from "../compliance/eta-receipt-queue";

const VISIT_CHARGE_CATEGORIES = ["VISIT", "VISIT_FEE"] as const;

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

  let existingRevenue = await tx.revenueEntry.findFirst({
    where: { tenantId, encounterId, category: "VISIT_FEE", status: RevenueStatus.POSTED },
  });

  if (appointmentId && amount > 0 && !existingRevenue) {
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
      existingRevenue = aptCharge;
    }
  }

  const currency =
    currencyOpt?.trim() && isBaseCurrency(currencyOpt.trim())
      ? currencyOpt.trim()
      : await resolveClinicCurrency(tx, tenantId, clinicId);

  const collectionData = params.collection ? collectionFieldsFromParsed(params.collection) : {};

  const patient = await tx.patient.findFirst({
    where: { id: params.patientId, tenantId },
    select: { firstNameEn: true, lastNameEn: true },
  });
  const buyerName =
    patient ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim() || "Patient" : "Patient";

  const queueCommon = {
    tenantId,
    clinicId,
    patientId: params.patientId,
    currency,
    vatPercent: params.vatPercent ?? 0,
    clinicTaxRin: params.clinicTaxRin,
    buyerName,
    collectionMode: params.collection?.collectionMode,
    transferChannel: params.collection?.transferChannel,
    transferReference: params.collection?.transferReference,
  };

  if (amount > 0) {
    if (existingRevenue) {
      const oldAmount = Number(existingRevenue.grossAmount);
      if (oldAmount > 0 && Math.abs(oldAmount - amount) <= 0.001) {
        return;
      }
      if (oldAmount > 0 && Math.abs(oldAmount - amount) > 0.001) {
        await tx.revenueEntry.update({
          where: { id: existingRevenue.id },
          data: {
            status: RevenueStatus.VOID,
            grossAmount: new Prisma.Decimal("0"),
            netAmount: new Prisma.Decimal("0"),
          },
        });
        await queueEtaReceipt(tx, {
          ...queueCommon,
          returnForRevenueEntryId: existingRevenue.id,
          totalAmount: oldAmount,
          currency: existingRevenue.currency,
          description: `Return · ${existingRevenue.description ?? "Visit fee"}`,
        });
        const created = await tx.revenueEntry.create({
          data: {
            tenantId,
            clinicId,
            encounterId,
            category: "VISIT_FEE",
            postedAt: new Date(),
            status: RevenueStatus.POSTED,
            grossAmount: new Prisma.Decimal(String(amount)),
            netAmount: new Prisma.Decimal(String(amount)),
            taxAmount: new Prisma.Decimal("0"),
            currency,
            appointmentId,
            description: `Visit fee · encounter ${encounterId.slice(0, 8)}… (amended)`,
            ...(params.transferVerificationStatus !== undefined
              ? { transferVerificationStatus: params.transferVerificationStatus }
              : {}),
            ...collectionData,
          },
        });
        await queueEtaReceipt(tx, {
          ...queueCommon,
          revenueEntryId: created.id,
          totalAmount: amount,
          description: created.description ?? "Visit fee",
        });
        return;
      }
    }

    const revenueData = {
      grossAmount: new Prisma.Decimal(String(amount)),
      netAmount: new Prisma.Decimal(String(amount)),
      taxAmount: new Prisma.Decimal("0"),
      currency,
      appointmentId,
      description: `Visit fee · encounter ${encounterId.slice(0, 8)}…`,
      ...(params.transferVerificationStatus !== undefined
        ? { transferVerificationStatus: params.transferVerificationStatus }
        : {}),
      ...collectionData,
    };
    let revenueId: string;
    if (existingRevenue) {
      const updated = await tx.revenueEntry.update({ where: { id: existingRevenue.id }, data: revenueData });
      revenueId = updated.id;
    } else {
      const created = await tx.revenueEntry.create({
        data: {
          tenantId,
          clinicId,
          encounterId,
          category: "VISIT_FEE",
          postedAt: new Date(),
          status: RevenueStatus.POSTED,
          ...revenueData,
        },
      });
      revenueId = created.id;
    }
    await queueEtaReceipt(tx, {
      ...queueCommon,
      revenueEntryId: revenueId,
      totalAmount: amount,
      description: revenueData.description,
    });
    return;
  }

  if (existingRevenue) {
    const voidAmount = Number(existingRevenue.grossAmount);
    await tx.revenueEntry.update({
      where: { id: existingRevenue.id },
      data: {
        status: RevenueStatus.VOID,
        grossAmount: new Prisma.Decimal("0"),
        netAmount: new Prisma.Decimal("0"),
      },
    });
    if (voidAmount > 0) {
      await queueEtaReceipt(tx, {
        ...queueCommon,
        returnForRevenueEntryId: existingRevenue.id,
        totalAmount: voidAmount,
        currency: existingRevenue.currency,
        description: `Return · ${existingRevenue.description ?? "Visit fee"}`,
      });
    }
  }
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