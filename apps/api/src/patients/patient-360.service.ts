import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  ClinicalPhotoKind,
  EncounterFollowUpStatus,
  EncounterStatus,
  OperationStatus,
  PatientActiveProblemStatus,
  PatientFamilyRelation,
  Prisma,
  RevenueStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import {
  invoiceFinancialsVisible,
  loadUserMoneyVisibilityOverrides,
} from "../common/user-money-visibility";
import { PrismaService } from "../prisma/prisma.service";
import {
  clusterDoubleLinkedPatients,
  isSafeAutoMergeCluster,
} from "./double-linked-patients";
import {
  patientMergeFillEmptyChoices,
  patientMergeRichnessScore,
  patientMergeTargetUpdateData,
  type PatientMergeFieldChoices,
  type PatientMergeSnapshot,
} from "./patient-merge-fields";

const ACTIVE_APPT = new Set<AppointmentStatus>([
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
]);

@Injectable()
export class Patient360Service {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } });
    if (!patient) throw new NotFoundException("Patient not found");

    const [allergies, problems, latestEnc, upcomingAppts, followUps] = await Promise.all([
      this.prisma.patientAllergy.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: "desc" } }),
      this.prisma.patientActiveProblem.findMany({
        where: { tenantId, patientId, status: PatientActiveProblemStatus.ACTIVE },
        orderBy: { onsetDate: "desc" },
      }),
      this.prisma.encounter.findFirst({
        where: { tenantId, patientId, status: EncounterStatus.FINALIZED },
        orderBy: { finalizedAt: "desc" },
        include: { medications: true },
      }),
      this.prisma.appointment.findMany({
        where: { tenantId, patientId, status: { in: [...ACTIVE_APPT] }, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
        include: { clinician: { select: { displayName: true } }, appointmentType: true },
      }),
      this.prisma.encounter.findMany({
        where: {
          tenantId,
          patientId,
          followUpStatus: { in: [EncounterFollowUpStatus.PENDING_BOOKING, EncounterFollowUpStatus.REMINDER_SENT] },
        },
        orderBy: { followUpDueAt: "asc" },
        take: 5,
      }),
    ]);

    const currentMedications = (latestEnc?.medications ?? []).map((m) => ({
      drugName: m.drugName,
      dosage: m.dosage,
      frequency: m.frequency,
      encounterId: latestEnc!.id,
      asOf: latestEnc!.finalizedAt?.toISOString() ?? latestEnc!.updatedAt.toISOString(),
    }));

    const lastVitals = latestEnc
      ? {
          at: latestEnc.finalizedAt?.toISOString() ?? latestEnc.updatedAt.toISOString(),
          heartRate: latestEnc.heartRate,
          spo2: latestEnc.spo2,
          bpSystolic: latestEnc.bpSystolic,
          bpDiastolic: latestEnc.bpDiastolic,
          temperature: latestEnc.temperature != null ? Number(latestEnc.temperature) : null,
          weightKg: latestEnc.weightKg != null ? Number(latestEnc.weightKg) : null,
          heightCm: latestEnc.heightCm != null ? Number(latestEnc.heightCm) : null,
        }
      : null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });
    const orgCurrency = (tenant?.baseCurrency ?? "AED").trim().toUpperCase();

    const byCurrency = new Map<string, number>();
    const addOutstanding = (currency: string | null | undefined, amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0.001) return;
      const code = (currency?.trim() || orgCurrency).toUpperCase();
      const rounded = Math.round(amount * 100) / 100;
      byCurrency.set(code, Math.round(((byCurrency.get(code) ?? 0) + rounded) * 100) / 100);
    };

    const [receivables, operations] = await Promise.all([
      this.prisma.revenueEntry.findMany({
        where: {
          tenantId,
          status: RevenueStatus.RECEIVABLE,
          netAmount: { gt: 0 },
          operationId: null,
          OR: [{ encounter: { patientId } }, { appointment: { patientId } }],
        },
        select: { netAmount: true, currency: true },
      }),
      this.prisma.operation.findMany({
        where: { tenantId, patientId, status: { not: OperationStatus.CANCELLED } },
        select: { totalCost: true, paidAmount: true, feeCurrency: true },
      }),
    ]);

    for (const r of receivables) {
      addOutstanding(r.currency, Number(r.netAmount));
    }
    for (const op of operations) {
      addOutstanding(op.feeCurrency, Math.max(0, Number(op.totalCost) - Number(op.paidAmount)));
    }

    const outstandingBalances = [...byCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .filter((row) => row.amount > 0.001)
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));

    const primary =
      outstandingBalances.length === 1
        ? outstandingBalances[0]!
        : outstandingBalances.find((b) => b.currency === orgCurrency) ?? {
            currency: orgCurrency,
            amount: 0,
          };
    const outstandingBalance = primary.amount;
    const outstandingBalanceCurrency = primary.currency;

    const alerts: { kind: string; messageEn: string; messageAr: string }[] = [];
    if (allergies.length > 0) {
      alerts.push({
        kind: "ALLERGY",
        messageEn: `${allergies.length} documented allerg${allergies.length === 1 ? "y" : "ies"}`,
        messageAr: `${allergies.length} حساسية مسجّلة`,
      });
    }
    if (patient.requiresAppointmentDeposit) {
      alerts.push({
        kind: "DEPOSIT",
        messageEn: "Appointment deposit required (repeat no-shows)",
        messageAr: "مطلوب عربون للموعد (تغيّب متكرر)",
      });
    }
    if (patient.noShowCount >= 2) {
      alerts.push({
        kind: "NO_SHOW",
        messageEn: `${patient.noShowCount} recorded no-shows`,
        messageAr: `${patient.noShowCount} تغيّب عن المواعيد`,
      });
    }
    for (const fu of followUps) {
      if (fu.followUpDueAt) {
        alerts.push({
          kind: "FOLLOW_UP",
          messageEn: `Follow-up due ${fu.followUpDueAt.toLocaleDateString("en-GB")}`,
          messageAr: `متابعة مستحقة ${fu.followUpDueAt.toLocaleDateString("ar")}`,
        });
      }
    }

    return {
      patientId,
      allergies,
      activeProblems: problems,
      currentMedications,
      lastVitals,
      alerts,
      outstandingBalance,
      outstandingBalanceCurrency,
      outstandingBalances,
      upcomingAppointments: upcomingAppts.map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt?.toISOString() ?? null,
        clinicianName: a.clinician.displayName,
        typeName: a.appointmentType?.nameEn ?? null,
        status: a.status,
      })),
      pendingFollowUps: followUps.map((e) => ({
        encounterId: e.id,
        dueAt: e.followUpDueAt?.toISOString() ?? null,
        note: e.followUpNote,
        status: e.followUpStatus,
      })),
    };
  }

  async getTimeline(
    tenantId: string,
    viewer: JwtUser,
    patientId: string,
    types?: string,
    limit = 80,
  ): Promise<{ items: Record<string, unknown>[] }> {
    const moneyVis = await loadUserMoneyVisibilityOverrides(this.prisma, tenantId, viewer.userId);
    const allowed = types
      ? new Set(types.split(",").map((t) => t.trim().toUpperCase()))
      : new Set(["VISIT", "OPERATION", "DOCUMENT", "INVOICE", "MESSAGE"]);

    const items: { at: Date; type: string; payload: Record<string, unknown> }[] = [];

    if (allowed.has("VISIT")) {
      const rows = await this.prisma.encounter.findMany({
        where: { tenantId, patientId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { id: true, status: true, visitType: true, updatedAt: true, finalizedAt: true },
      });
      for (const r of rows) {
        items.push({
          at: r.finalizedAt ?? r.updatedAt,
          type: "VISIT",
          payload: { encounterId: r.id, status: r.status, visitType: r.visitType },
        });
      }
    }
    if (allowed.has("OPERATION")) {
      const rows = await this.prisma.operation.findMany({
        where: { tenantId, patientId },
        orderBy: { operationDate: "desc" },
        take: limit,
      });
      for (const r of rows) {
        items.push({
          at: r.operationDate,
          type: "OPERATION",
          payload: { operationId: r.id, status: r.status, totalCost: Number(r.totalCost) },
        });
      }
    }
    if (allowed.has("DOCUMENT")) {
      const rows = await this.prisma.patientDocument.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const r of rows) {
        items.push({
          at: r.createdAt,
          type: "DOCUMENT",
          payload: { documentId: r.id, description: r.description, fileName: r.originalFileName },
        });
      }
      const photos = await this.prisma.patientClinicalPhoto.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const p of photos) {
        items.push({
          at: p.takenAt ?? p.createdAt,
          type: "DOCUMENT",
          payload: { photoId: p.id, kind: p.kind, caption: p.caption, pairGroupId: p.pairGroupId },
        });
      }
    }
    if (allowed.has("INVOICE")) {
      const rows = await this.prisma.invoice.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          currency: true,
          encounterId: true,
          operationId: true,
          encounter: {
            select: {
              clinicianId: true,
              appointment: { select: { clinicianId: true } },
            },
          },
          operation: { select: { clinicianId: true } },
        },
      });
      for (const r of rows) {
        const visible = invoiceFinancialsVisible(
          viewer,
          {
            encounterId: r.encounterId,
            operationId: r.operationId,
            encounterClinicianId: r.encounter?.clinicianId,
            operationClinicianId: r.operation?.clinicianId,
            appointmentClinicianId: r.encounter?.appointment?.clinicianId ?? null,
          },
          moneyVis,
        );
        if (!visible) continue;
        items.push({ at: r.createdAt, type: "INVOICE", payload: { invoiceId: r.id, number: r.invoiceNumber, currency: r.currency } });
      }
    }
    if (allowed.has("MESSAGE")) {
      const rows = await this.prisma.supportTicket.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, title: true, status: true, createdAt: true },
      });
      for (const r of rows) {
        items.push({
          at: r.createdAt,
          type: "MESSAGE",
          payload: { ticketId: r.id, title: r.title, status: r.status },
        });
      }
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      items: items.slice(0, limit).map((i) => ({
        type: i.type,
        at: i.at.toISOString(),
        ...i.payload,
      })),
    };
  }

  async listActiveProblems(tenantId: string, patientId: string) {
    return this.prisma.patientActiveProblem.findMany({
      where: { tenantId, patientId },
      orderBy: [{ status: "asc" }, { onsetDate: "desc" }],
    });
  }

  async upsertActiveProblem(
    tenantId: string,
    patientId: string,
    body: {
      id?: string;
      icd10Code?: string;
      labelEn: string;
      labelAr?: string;
      status?: PatientActiveProblemStatus;
      onsetDate?: string;
    },
  ) {
    const data: Prisma.PatientActiveProblemCreateInput = {
      tenant: { connect: { id: tenantId } },
      patient: { connect: { id: patientId } },
      icd10Code: body.icd10Code?.trim() || null,
      labelEn: body.labelEn.trim(),
      labelAr: body.labelAr?.trim() || null,
      status: body.status ?? PatientActiveProblemStatus.ACTIVE,
      onsetDate: body.onsetDate ? new Date(body.onsetDate) : null,
      resolvedAt: body.status === PatientActiveProblemStatus.RESOLVED ? new Date() : null,
    };
    if (body.id) {
      const ex = await this.prisma.patientActiveProblem.findFirst({ where: { id: body.id, tenantId, patientId } });
      if (!ex) throw new NotFoundException("Problem not found");
      return this.prisma.patientActiveProblem.update({
        where: { id: body.id },
        data: {
          icd10Code: data.icd10Code,
          labelEn: data.labelEn,
          labelAr: data.labelAr,
          status: data.status,
          onsetDate: data.onsetDate,
          resolvedAt: data.resolvedAt,
        },
      });
    }
    return this.prisma.patientActiveProblem.create({ data });
  }

  async listFamilyLinks(tenantId: string, patientId: string) {
    const links = await this.prisma.patientFamilyLink.findMany({
      where: { tenantId, OR: [{ fromPatientId: patientId }, { toPatientId: patientId }] },
      include: {
        fromPatient: { select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
        toPatient: { select: { id: true, mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
      },
    });
    return links;
  }

  async addFamilyLink(
    tenantId: string,
    fromPatientId: string,
    body: { toPatientId: string; relation: PatientFamilyRelation },
  ) {
    if (fromPatientId === body.toPatientId) throw new BadRequestException("Cannot link patient to self");
    return this.prisma.patientFamilyLink.create({
      data: {
        tenantId,
        fromPatientId,
        toPatientId: body.toPatientId,
        relation: body.relation,
      },
    });
  }

  async removeFamilyLink(tenantId: string, linkId: string) {
    const row = await this.prisma.patientFamilyLink.findFirst({ where: { id: linkId, tenantId } });
    if (!row) throw new NotFoundException("Link not found");
    await this.prisma.patientFamilyLink.delete({ where: { id: linkId } });
  }

  async mergePatients(
    tenantId: string,
    user: JwtUser,
    targetId: string,
    sourcePatientId: string,
    fieldChoices?: PatientMergeFieldChoices,
  ) {
    if (targetId === sourcePatientId) throw new BadRequestException("Source and target must differ");
    const [target, source] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: targetId, tenantId, deletedAt: null } }),
      this.prisma.patient.findFirst({ where: { id: sourcePatientId, tenantId, deletedAt: null } }),
    ]);
    if (!target || !source) throw new NotFoundException("Patient not found");

    const effectiveChoices =
      fieldChoices && Object.keys(fieldChoices).length > 0
        ? fieldChoices
        : patientMergeFillEmptyChoices(target, source);
    const targetUpdate = patientMergeTargetUpdateData(target, source, effectiveChoices);
    const takingPhone = effectiveChoices.phone === "source";
    const takingNationalId = effectiveChoices.nationalId === "source" && Boolean(source.nationalId);

    await this.prisma.$transaction(async (tx) => {
      // Free unique / soft-unique fields on source before copying onto target.
      if (takingPhone || takingNationalId) {
        await tx.patient.update({
          where: { id: sourcePatientId },
          data: {
            ...(takingPhone
              ? { phone: `merged-pending-${sourcePatientId.slice(0, 8)}-${source.phone}` }
              : {}),
            ...(takingNationalId ? { nationalId: null } : {}),
          },
        });
      }

      if (Object.keys(targetUpdate).length > 0) {
        await tx.patient.update({ where: { id: targetId }, data: targetUpdate });
      }

      const move = { patientId: targetId };
      await tx.encounter.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.appointment.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.operation.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.patientDocument.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.patientAllergy.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.patientActiveProblem.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.patientClinicalPhoto.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.invoice.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.appointmentWaitlistEntry.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.appointmentSeries.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.clinicalLetter.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.supportTicket.updateMany({ where: { tenantId, patientId: sourcePatientId }, data: move });
      await tx.patient.update({
        where: { id: sourcePatientId },
        data: {
          deletedAt: new Date(),
          phone: `merged-${sourcePatientId.slice(0, 8)}-${source.phone}`,
          nationalId: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "patient.merge",
          resource: "Patient",
          resourceId: targetId,
          patientId: targetId,
          metadata: {
            sourcePatientId,
            targetPatientId: targetId,
            fieldChoices: effectiveChoices,
          } as Prisma.InputJsonValue,
        },
      });
    });
    return { ok: true, targetPatientId: targetId, mergedPatientId: sourcePatientId };
  }

  /**
   * Auto-merge safe duplicate clusters for a tenant (same phone+name, national ID, or name+DOB).
   * Keeps the richer chart as target and fills empty demographics from sources; moves all clinical links/docs.
   */
  async mergeSafeDuplicatePatients(tenantId: string, user: JwtUser) {
    const listed = await this.listDoubleLinkedPatients(tenantId);
    const merges: Array<{
      reason: string;
      matchKey: string;
      targetPatientId: string;
      mergedPatientIds: string[];
    }> = [];
    const skipped: Array<{ reason: string; matchKey: string; patientIds: string[]; why: string }> = [];

    for (const cluster of listed.clusters) {
      const rows = cluster.patients.map((p) => ({
        ...p,
        dob: p.dob ? new Date(p.dob) : null,
        createdAt: new Date(p.createdAt),
      }));
      if (!isSafeAutoMergeCluster({ reason: cluster.reason, matchKey: cluster.matchKey, patients: rows })) {
        skipped.push({
          reason: cluster.reason,
          matchKey: cluster.matchKey,
          patientIds: cluster.patients.map((p) => p.id),
          why: "not_safe_auto_merge",
        });
        continue;
      }

      const scored = await Promise.all(
        cluster.patients.map(async (p) => {
          const full = await this.prisma.patient.findFirstOrThrow({
            where: { id: p.id, tenantId, deletedAt: null },
          });
          const [documents, encounters, appointments, operations] = await Promise.all([
            this.prisma.patientDocument.count({ where: { tenantId, patientId: p.id } }),
            this.prisma.encounter.count({ where: { tenantId, patientId: p.id } }),
            this.prisma.appointment.count({ where: { tenantId, patientId: p.id } }),
            this.prisma.operation.count({ where: { tenantId, patientId: p.id } }),
          ]);
          const snapshot: PatientMergeSnapshot = {
            firstNameEn: full.firstNameEn,
            lastNameEn: full.lastNameEn,
            firstNameAr: full.firstNameAr,
            lastNameAr: full.lastNameAr,
            phone: full.phone,
            email: full.email,
            nationalId: full.nationalId,
            dob: full.dob,
            gender: full.gender,
            homeBranchId: full.homeBranchId,
            acquisitionChannel: full.acquisitionChannel,
            acquisitionReferralName: full.acquisitionReferralName,
            acquisitionOtherDetail: full.acquisitionOtherDetail,
            isVip: full.isVip,
            needsChaperone: full.needsChaperone,
          };
          return {
            id: p.id,
            score: patientMergeRichnessScore(snapshot, { documents, encounters, appointments, operations }),
            createdAt: full.createdAt.getTime(),
          };
        }),
      );
      scored.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
      const targetId = scored[0]!.id;
      const mergedPatientIds: string[] = [];
      for (const src of scored.slice(1)) {
        const stillThere = await this.prisma.patient.findFirst({
          where: { id: src.id, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!stillThere) continue;
        await this.mergePatients(tenantId, user, targetId, src.id);
        mergedPatientIds.push(src.id);
      }
      if (mergedPatientIds.length) {
        merges.push({
          reason: cluster.reason,
          matchKey: cluster.matchKey,
          targetPatientId: targetId,
          mergedPatientIds,
        });
      }
    }

    return {
      ok: true,
      mergedClusters: merges.length,
      merges,
      skipped,
    };
  }

  async listDoubleLinkedPatients(tenantId: string) {
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null, isSample: false },
      select: {
        id: true,
        mrn: true,
        firstNameEn: true,
        lastNameEn: true,
        firstNameAr: true,
        lastNameAr: true,
        phone: true,
        email: true,
        nationalId: true,
        dob: true,
        gender: true,
        homeBranchId: true,
        createdAt: true,
      },
      take: 5000,
      orderBy: { createdAt: "desc" },
    });
    const clusters = clusterDoubleLinkedPatients(rows);
    return {
      clusters: clusters.map((c) => ({
        reason: c.reason,
        matchKey: c.matchKey,
        patients: c.patients.map((p) => ({
          ...p,
          dob: p.dob?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      })),
      totalClusters: clusters.length,
      scannedPatients: rows.length,
    };
  }

  async listClinicalPhotos(tenantId: string, patientId: string) {
    return this.prisma.patientClinicalPhoto.findMany({
      where: { tenantId, patientId },
      orderBy: [{ pairGroupId: "asc" }, { takenAt: "desc" }],
    });
  }

  async createClinicalPhotoMeta(
    tenantId: string,
    patientId: string,
    meta: {
      kind: ClinicalPhotoKind;
      pairGroupId?: string;
      caption?: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      relativePath: string;
      takenAt?: string;
    },
  ) {
    return this.prisma.patientClinicalPhoto.create({
      data: {
        tenantId,
        patientId,
        kind: meta.kind,
        pairGroupId: meta.pairGroupId?.trim() || null,
        caption: meta.caption?.trim() || null,
        originalFileName: meta.originalFileName,
        mimeType: meta.mimeType,
        sizeBytes: meta.sizeBytes,
        relativePath: meta.relativePath,
        takenAt: meta.takenAt ? new Date(meta.takenAt) : null,
      },
    });
  }
}
