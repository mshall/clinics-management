import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  CommissionChargeStatus,
  CommissionDisputeReason,
  CommissionDisputeStatus,
  Prisma,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { parsePageParams } from "../common/pagination";
import { NewPatientService } from "../patients/new-patient.service";
import { AttributionEvidenceService } from "./attribution-evidence.service";
import { PrismaService } from "../prisma/prisma.service";
import { findDuplicateCharge, shouldAutoApproveExistingPatient } from "./commission-dispute-auto";
import {
  COMMISSION_DISPUTE_SLA_WORKING_DAYS,
  DEFAULT_WEEKEND_DAYS,
  disputeSlaBreached,
  disputeSlaDueAt,
} from "./commission-dispute-sla";
import {
  CommissionChargeService,
  type BilledReversalCreditIntent,
  type KiorexCommissionChargeView,
} from "./commission-charge.service";
import type { ResolveCommissionDisputeDto } from "./dto/resolve-commission-dispute.dto";

const DISPUTE_RESOLVED_TOPIC = "billing.commission_dispute_resolved";

export type CommissionDisputeSummary = {
  id: string;
  reason: CommissionDisputeReason;
  status: CommissionDisputeStatus;
  note: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type OpenDisputeResult = KiorexCommissionChargeView & { dispute: CommissionDisputeSummary };

export type PlatformCommissionDisputeRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  chargeId: string;
  amount: string;
  currency: string;
  reason: CommissionDisputeReason;
  status: CommissionDisputeStatus;
  note: string | null;
  createdAt: string;
  slaDueAt: string;
  slaBreached: boolean;
  patientInitials: string;
  clinicianName: string;
};

@Injectable()
export class CommissionDisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: CommissionChargeService,
    private readonly newPatients: NewPatientService,
    /** GRW-P1-D2: evidence for PROVIDER_LED_EVIDENCE disputes. Optional so older constructions keep working (no auto-approval without it). */
    @Optional() private readonly evidence?: AttributionEvidenceService,
  ) {}

  private assertPlatform(user: JwtUser): void {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin required");
  }

  async openDispute(
    user: JwtUser,
    tenantId: string,
    chargeId: string,
    reason: CommissionDisputeReason,
    note?: string,
  ): Promise<OpenDisputeResult> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    if (reason === CommissionDisputeReason.OTHER && !note?.trim()) {
      throw new BadRequestException("A note is required when reason is OTHER");
    }

    let creditIntent: BilledReversalCreditIntent | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.kiorexCommissionCharge.findFirst({
        where: { id: chargeId, tenantId },
        include: {
          clinician: { select: { displayName: true } },
          patient: { select: { firstNameEn: true, lastNameEn: true } },
          commissionDispute: true,
        },
      });
      if (!row) throw new NotFoundException("Charge not found");
      if (row.commissionDispute) {
        throw new BadRequestException("This charge already has a dispute");
      }
      if (row.status !== CommissionChargeStatus.PENDING && row.status !== CommissionChargeStatus.CONFIRMED) {
        throw new BadRequestException("Only pending or confirmed charges can be disputed");
      }
      const now = new Date();
      if (now > row.disputeDeadline) {
        throw new BadRequestException({
          message: "Dispute window has closed for this charge",
          code: "KIOREX_DISPUTE_WINDOW_CLOSED",
          disputeDeadline: row.disputeDeadline.toISOString(),
        });
      }

      const dispute = await tx.commissionDispute.create({
        data: {
          chargeId: row.id,
          tenantId,
          reason,
          note: note?.trim() || null,
          status: CommissionDisputeStatus.OPEN,
        },
      });

      const disputedCharge = await tx.kiorexCommissionCharge.update({
        where: { id: row.id },
        data: { status: CommissionChargeStatus.DISPUTED },
      });
      await this.charges.emitStatusChanged(tx, disputedCharge);

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "kiorex.commission_dispute.opened",
          resource: "CommissionDispute",
          resourceId: dispute.id,
          metadata: {
            chargeId: row.id,
            reason,
            note: dispute.note,
          } as Prisma.InputJsonValue,
        },
      });

      const auto = await this.tryAutoResolve(tx, dispute.id, tenantId, row.patientId, row.id, reason, row.attendedAt, row.appointmentId);
      creditIntent = auto.creditIntent;

      const finalDispute =
        (await tx.commissionDispute.findUniqueOrThrow({ where: { id: dispute.id } }));
      const finalCharge = await tx.kiorexCommissionCharge.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          clinician: { select: { displayName: true } },
          patient: { select: { firstNameEn: true, lastNameEn: true } },
          commissionDispute: true,
        },
      });

      return { finalCharge, finalDispute };
    });

    if (creditIntent) {
      await this.charges.grantLateReversalCredit(creditIntent);
    }

    const view = this.charges.mapRowPublic(result.finalCharge, new Date());
    return {
      ...view,
      dispute: this.mapDisputeSummary(result.finalDispute),
    };
  }

  private async tryAutoResolve(
    tx: Prisma.TransactionClient,
    disputeId: string,
    tenantId: string,
    patientId: string,
    chargeId: string,
    reason: CommissionDisputeReason,
    attendedAt: Date,
    appointmentId?: string,
  ): Promise<{ creditIntent: BilledReversalCreditIntent | null }> {
    let autoApprove = false;
    let autoNote = "";

    if (reason === CommissionDisputeReason.EXISTING_PATIENT) {
      autoApprove = await shouldAutoApproveExistingPatient(this.newPatients, tenantId, patientId, attendedAt);
      autoNote = "Auto-approved: prior visit found for matching patient identity";
    } else if (reason === CommissionDisputeReason.DUPLICATE) {
      const dupe = await findDuplicateCharge(tx, tenantId, patientId, chargeId, attendedAt);
      autoApprove = !!dupe;
      autoNote = dupe
        ? `Auto-approved: duplicate charge ${dupe.id} within ${7} days`
        : "";
    } else if (reason === CommissionDisputeReason.PROVIDER_LED_EVIDENCE && appointmentId && this.evidence?.autoApproveEnabled) {
      // GRW-P1-D2: signed Kiorex evidence (or, in mock mode, the Clinic's own link facts) shows a provider touch the original decision missed.
      const v = await this.evidence.verdict(tx, tenantId, appointmentId);
      autoApprove = v.providerLed;
      autoNote = autoApprove ? `Auto-approved: provider-led evidence confirmed (${v.source}${v.reason ? `, ${v.reason}` : ""})` : "";
    }

    if (!autoApprove) return { creditIntent: null };

    const resolvedAt = new Date();
    const dispute = await tx.commissionDispute.update({
      where: { id: disputeId },
      data: {
        status: CommissionDisputeStatus.AUTO_APPROVED,
        resolvedAt,
        resolution: autoNote,
        resolvedBy: null,
      },
    });

    const creditIntent = await this.charges.onApprovedDispute(tx, tenantId, chargeId);

    await tx.auditLog.create({
      data: {
        tenantId,
        action: "kiorex.commission_dispute.resolved",
        resource: "CommissionDispute",
        resourceId: disputeId,
        metadata: {
          status: CommissionDisputeStatus.AUTO_APPROVED,
          resolution: autoNote,
        } as Prisma.InputJsonValue,
      },
    });

    await this.enqueueOwnerNotification(tx, tenantId, disputeId, chargeId, "APPROVED", autoNote);

    return { creditIntent };
  }

  async listForPlatform(
    user: JwtUser,
    opts?: { status?: CommissionDisputeStatus; page?: number; pageSize?: number },
  ) {
    this.assertPlatform(user);
    const { page, pageSize, skip } = parsePageParams(
      opts?.page != null ? String(opts.page) : undefined,
      opts?.pageSize != null ? String(opts.pageSize) : undefined,
    );
    const where: Prisma.CommissionDisputeWhereInput = {};
    if (opts?.status) where.status = opts.status;
    else where.status = CommissionDisputeStatus.OPEN;

    const [total, rows] = await Promise.all([
      this.prisma.commissionDispute.count({ where }),
      this.prisma.commissionDispute.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
        include: {
          tenant: { select: { name: true, market: { select: { weekendDays: true } } } },
          charge: {
            include: {
              clinician: { select: { displayName: true } },
              patient: { select: { firstNameEn: true, lastNameEn: true } },
            },
          },
        },
      }),
    ]);

    const items: PlatformCommissionDisputeRow[] = rows.map((row) => {
      const rawWeekend = row.tenant.market?.weekendDays;
      const weekend = Array.isArray(rawWeekend)
        ? rawWeekend.filter((d): d is number => typeof d === "number")
        : DEFAULT_WEEKEND_DAYS;
      const first = row.charge.patient.firstNameEn?.trim()?.[0] ?? "";
      const last = row.charge.patient.lastNameEn?.trim()?.[0] ?? "";
      return {
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        chargeId: row.chargeId,
        amount: row.charge.amount.toFixed(2),
        currency: row.charge.currency,
        reason: row.reason,
        status: row.status,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        slaDueAt: disputeSlaDueAt(row.createdAt, weekend).toISOString(),
        slaBreached: disputeSlaBreached(row.createdAt, weekend),
        patientInitials: `${first}${last}`.toUpperCase() || "—",
        clinicianName: row.charge.clinician.displayName,
      };
    });

    return {
      items,
      page,
      pageSize,
      total,
      slaWorkingDays: COMMISSION_DISPUTE_SLA_WORKING_DAYS,
    };
  }

  async resolve(user: JwtUser, disputeId: string, body: ResolveCommissionDisputeDto) {
    this.assertPlatform(user);
    const resolution = body.resolution?.trim() || null;
    if (body.decision === "REJECT" && !resolution) {
      throw new BadRequestException("Resolution message is required when rejecting a dispute");
    }

    let creditIntent: BilledReversalCreditIntent | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const dispute = await tx.commissionDispute.findUnique({
        where: { id: disputeId },
        include: { charge: true },
      });
      if (!dispute) throw new NotFoundException("Dispute not found");
      if (dispute.status !== CommissionDisputeStatus.OPEN) {
        throw new BadRequestException("Only open disputes can be resolved");
      }

      const tenantId = dispute.tenantId;
      const chargeId = dispute.chargeId;
      const now = new Date();

      if (body.decision === "APPROVE") {
        const updatedDispute = await tx.commissionDispute.update({
          where: { id: disputeId },
          data: {
            status: CommissionDisputeStatus.APPROVED,
            resolvedAt: now,
            resolvedBy: user.userId,
            resolution: resolution ?? "Approved by platform",
          },
        });
        creditIntent = await this.charges.onApprovedDispute(tx, tenantId, chargeId);
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: user.userId,
            action: "kiorex.commission_dispute.resolved",
            resource: "CommissionDispute",
            resourceId: disputeId,
            metadata: {
              status: CommissionDisputeStatus.APPROVED,
              resolution: updatedDispute.resolution,
            } as Prisma.InputJsonValue,
          },
        });
        await this.enqueueOwnerNotification(tx, tenantId, disputeId, chargeId, "APPROVED", updatedDispute.resolution);
        return updatedDispute;
      }

      const backStatus =
        dispute.charge.confirmedAt != null
          ? CommissionChargeStatus.CONFIRMED
          : CommissionChargeStatus.PENDING;

      const backCharge = await tx.kiorexCommissionCharge.update({
        where: { id: chargeId },
        data: { status: backStatus },
      });

      const updatedDispute = await tx.commissionDispute.update({
        where: { id: disputeId },
        data: {
          status: CommissionDisputeStatus.REJECTED,
          resolvedAt: now,
          resolvedBy: user.userId,
          resolution: resolution!,
        },
      });
      await this.charges.emitStatusChanged(tx, backCharge);

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "kiorex.commission_dispute.resolved",
          resource: "CommissionDispute",
          resourceId: disputeId,
          metadata: {
            status: CommissionDisputeStatus.REJECTED,
            resolution: updatedDispute.resolution,
            chargeStatus: backStatus,
          } as Prisma.InputJsonValue,
        },
      });
      await this.enqueueOwnerNotification(tx, tenantId, disputeId, chargeId, "REJECTED", updatedDispute.resolution);
      return updatedDispute;
    });

    if (creditIntent) {
      await this.charges.grantLateReversalCredit(creditIntent);
    }

    return this.mapDisputeSummary(result);
  }

  private async enqueueOwnerNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    disputeId: string,
    chargeId: string,
    outcome: "APPROVED" | "REJECTED",
    resolution: string | null,
  ): Promise<void> {
    const owner = await tx.user.findFirst({
      where: { tenantId, isTenantOwner: true, deletedAt: null },
      select: { email: true },
    });
    await tx.outboxEvent.create({
      data: {
        tenantId,
        type: DISPUTE_RESOLVED_TOPIC,
        payload: {
          channel: "email",
          to: owner?.email ?? null,
          disputeId,
          chargeId,
          outcome,
          resolution,
        } as Prisma.InputJsonValue,
        aggregateType: "CommissionDispute",
        aggregateId: disputeId,
        target: "INTERNAL",
        status: "PENDING",
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        action: "kiorex.commission_dispute.owner_notified",
        resource: "CommissionDispute",
        resourceId: disputeId,
        metadata: { outcome, channel: "email" } as Prisma.InputJsonValue,
      },
    });
  }

  mapDisputeSummary(row: {
    id: string;
    reason: CommissionDisputeReason;
    status: CommissionDisputeStatus;
    note: string | null;
    resolution: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }): CommissionDisputeSummary {
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      note: row.note,
      resolution: row.resolution,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }
}