import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, BookingSource, EncounterStatus, Prisma, UserRole, VisitCollectionMode } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { findActiveSchedulingPhysician } from "../common/active-scheduling-physician";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentIntervalsOverlap,
  effectiveAppointmentEnd,
  resolveCreateAppointmentEnd,
} from "../common/appointment-scheduling";
import { CLINIC_SCOPE_ROLES, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { assertOrgClinicalDeleteRole } from "../common/org-clinical-delete-roles";
import { paginate, parsePageParams } from "../common/pagination";
import {
  getEncounterVisitFeeReceivableSummary,
  syncOpenEncounterVisitFeeFromAppointment,
} from "../common/visit-fee-ledger";
import { PrismaService } from "../prisma/prisma.service";
import { assertClinicianBillingSeatActive } from "../subscriptions/billing-seat-access";
import { parseScheduledFeeCollection } from "../common/visit-collection";
import {
  appointmentFinancialsVisible,
  canEditAppointmentFeesForViewer,
  loadUserMoneyVisibilityOverrides,
  type UserMoneyVisibilityOverrides,
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
} from "../common/user-money-visibility";
import { resolveTenantTransferCollectionContext } from "../common/market-transfer-context";
import { assertNoOpenEncounterForAppointmentComplete } from "./appointment-completion.guard";
import { assertScheduledTransferFeeCollected } from "./appointment-transfer-fee.guard";
import {
  buildRevertCheckInPatch,
  deleteDraftEncountersOnCheckInRevert,
  isRevertingAppointmentCheckIn,
} from "../front-desk/appointment-check-in-revert";
import { ensureDraftEncounterIfCheckedIn } from "../front-desk/ensure-draft-encounter-on-check-in";
import { FrontDeskFlowService } from "../front-desk/front-desk-flow.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { noShowRiskForAppointment } from "../common/no-show-risk";
import { SchedulingService } from "../scheduling/scheduling.service";
import { SlotService } from "../scheduling/slot.service";
import type { CreateAppointmentDto } from "./dto/create-appointment.dto";
import type { AppointmentDto } from "./dto/appointment.dto";
import type { UpdateAppointmentDto } from "./dto/update-appointment.dto";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { NewPatientService } from "../patients/new-patient.service";
import { isCommissionChargeableBooking } from "./booking-attribution";
import { CommissionChargeService, type BilledReversalCreditIntent } from "../kiorex/commission-charge.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { DepositSettlementService } from "../billing/deposit-settlement.service";
import { auditClinicCancellation, clinicCancellationEventMetadata, clinicCancellationPatch } from "./kiorex-clinic-cancel";

const appointmentDtoInclude = {
  patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true, noShowCount: true, requiresAppointmentDeposit: true } },
  clinic: { select: { nameEn: true, nameAr: true } },
  clinician: {
    select: {
      displayName: true,
      employee: { select: { firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true } },
    },
  },
} as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentDtoInclude }>;
type NoShowRiskContext = { enabled: boolean; depositsAvailable: boolean; now: Date };

function isPhysicianRole(role: UserRole | undefined): boolean {
  return role === UserRole.PHYSICIAN || String(role) === "PHYSICIAN";
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
    private readonly frontDeskFlow: FrontDeskFlowService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly newPatients: NewPatientService,
    private readonly commissionCharges: CommissionChargeService,
    private readonly slots: SlotService,
    private readonly appointmentOutbox: AppointmentOutboxService,
    private readonly entitlements: EntitlementsService,
    private readonly depositSettlement: DepositSettlementService,
  ) {}

  /** FS-05: the risk chip is a Pro+ front-desk feature; deposits are suggested only when the plan has them. */
  private async noShowRiskContext(tenantId: string): Promise<NoShowRiskContext> {
    const [enabled, depositsAvailable] = await Promise.all([
      this.entitlements.isEntitled(tenantId, "mod_front_desk"),
      this.entitlements.isEntitled(tenantId, "deposits"),
    ]);
    return { enabled, depositsAvailable, now: new Date() };
  }

  private async invalidateSlotsForAppointment(
    tenantId: string,
    clinicId: string,
    clinicianId: string,
    reason: string,
  ): Promise<void> {
    await this.slots.invalidateAndNotify(tenantId, clinicId, clinicianId, reason);
  }

  private async assertAppointmentAccess(
    viewer: JwtUser | undefined,
    row: { clinicianId: string; clinicId: string }
  ): Promise<void> {
    if (!viewer) return;
    if (isPhysicianRole(viewer.role) && row.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only access appointments where you are the clinician");
    }
    if (hasAnyRoleInSet(viewer, CLINIC_SCOPE_ROLES)) {
      if (viewer.tenantId == null) throw new ForbiddenException();
      const ok = await this.prisma.clinicAdminScope.findFirst({
        where: { tenantId: viewer.tenantId, userId: viewer.userId, clinicId: row.clinicId },
      });
      if (!ok) {
        throw new ForbiddenException("This appointment is outside your assigned clinics");
      }
    }
  }

  private clinicianNameParts(
    clinician: null | {
      displayName: string;
      employee: { firstNameEn: string; lastNameEn: string; firstNameAr: string | null; lastNameAr: string | null } | null;
    }
  ): {
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstNameAr: string | null;
    lastNameAr: string | null;
    display: string | null;
  } {
    if (!clinician) {
      return { firstNameEn: null, lastNameEn: null, firstNameAr: null, lastNameAr: null, display: null };
    }
    const e = clinician.employee;
    if (e) {
      const en = `${e.firstNameEn ?? ""} ${e.lastNameEn ?? ""}`.trim();
      return {
        firstNameEn: e.firstNameEn,
        lastNameEn: e.lastNameEn,
        firstNameAr: e.firstNameAr,
        lastNameAr: e.lastNameAr,
        display: en || clinician.displayName?.trim() || null,
      };
    }
    const d = clinician.displayName?.trim();
    const parts = d ? d.split(/\s+/) : [];
    return {
      firstNameEn: parts[0] ?? d ?? null,
      lastNameEn: parts.length > 1 ? parts.slice(1).join(" ") : null,
      firstNameAr: null,
      lastNameAr: null,
      display: d || null,
    };
  }

  private clinicianDisplayName(
    clinician: null | {
      displayName: string;
      employee: { firstNameEn: string; lastNameEn: string; firstNameAr: string | null; lastNameAr: string | null } | null;
    }
  ): string | null {
    return this.clinicianNameParts(clinician).display;
  }

  private async moneyOverrides(tenantId: string, viewer?: JwtUser): Promise<UserMoneyVisibilityOverrides> {
    return loadUserMoneyVisibilityOverrides(this.prisma, tenantId, viewer?.userId);
  }

  private mapRow(
    row: AppointmentRow,
    viewer?: JwtUser,
    overrides: UserMoneyVisibilityOverrides = DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    risk?: NoShowRiskContext,
  ): AppointmentDto {
    const financialsVisible = viewer
      ? appointmentFinancialsVisible(viewer, row.clinicianId, overrides)
      : true;
    const patient = row.patient;
    const clinician = row.clinician;
    const clinicianParts = this.clinicianNameParts(clinician ?? null);
    const dto: AppointmentDto = {
      id: row.id,
      clinicId: row.clinicId,
      clinicNameEn: row.clinic?.nameEn ?? null,
      clinicNameAr: row.clinic?.nameAr ?? null,
      patientId: row.patientId,
      clinicianId: row.clinicianId,
      clinicianName: clinicianParts.display,
      clinicianFirstNameEn: clinicianParts.firstNameEn,
      clinicianLastNameEn: clinicianParts.lastNameEn,
      clinicianFirstNameAr: clinicianParts.firstNameAr,
      clinicianLastNameAr: clinicianParts.lastNameAr,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      feeAmount: financialsVisible ? Number(row.feeAmount) : 0,
      financialsVisible,
      scheduledCollectionMode: row.scheduledCollectionMode ?? null,
      scheduledTransferChannel: row.scheduledTransferChannel ?? null,
      status: row.status,
      notes: row.notes,
      roomLabel: row.roomLabel ?? null,
      queueStage: row.queueStage ?? null,
      preferredRoomLabel: row.preferredRoomLabel ?? null,
      roomAssignedAt: row.roomAssignedAt?.toISOString() ?? null,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      queueTicketNumber: row.queueTicketNumber ?? null,
      whatsappConfirmedAt: row.whatsappConfirmedAt?.toISOString() ?? null,
      bookingSource: row.bookingSource,
      attributionJson:
        row.attributionJson && typeof row.attributionJson === "object" && !Array.isArray(row.attributionJson)
          ? (row.attributionJson as Record<string, unknown>)
          : null,
      isNewPatientAtBooking: row.isNewPatientAtBooking,
      newPatientCheckedAt: row.newPatientCheckedAt?.toISOString() ?? null,
      cancelledBy: row.cancelledBy ?? null,
      cancellationReason: row.cancellationReason ?? null,
      commissionChargeableAtBooking: isCommissionChargeableBooking(
        row.bookingSource,
        row.isNewPatientAtBooking,
      ),
      ...(patient
        ? {
            patientMrn: patient.mrn,
            patientName: `${patient.firstNameEn} ${patient.lastNameEn}`.trim(),
          }
        : {}),
      noShowRisk:
        risk?.enabled && patient
          ? noShowRiskForAppointment(row, patient, { now: risk.now, depositsAvailable: risk.depositsAvailable })
          : null,
    };
    return dto;
  }

  /** KX-07 / FS-04 — latest deposit per appointment for the badge (pending/held/applied…). */
  private async attachDeposits(tenantId: string, dtos: AppointmentDto[]): Promise<AppointmentDto[]> {
    if (!dtos.length) return dtos;
    const rows = await this.prisma.patientDeposit.findMany({
      where: { tenantId, appointmentId: { in: dtos.map((d) => d.id) } },
      orderBy: { createdAt: "desc" },
      select: { appointmentId: true, status: true, source: true, amount: true, currency: true, linkExpiresAt: true },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (r.appointmentId && !latest.has(r.appointmentId)) latest.set(r.appointmentId, r);
    return dtos.map((d) => {
      const dep = latest.get(d.id);
      if (!dep) return { ...d, deposit: null };
      return {
        ...d,
        deposit: {
          status: dep.status,
          source: dep.source,
          amount: d.financialsVisible === false ? 0 : Number(dep.amount),
          currency: dep.currency,
          linkExpiresAt: dep.linkExpiresAt?.toISOString() ?? null,
        },
      };
    });
  }

  private async finishAppointmentDto(tenantId: string, row: AppointmentRow, viewer?: JwtUser): Promise<AppointmentDto> {
    const [moneyVis, risk] = await Promise.all([this.moneyOverrides(tenantId, viewer), this.noShowRiskContext(tenantId)]);
    const [dto] = await this.attachDeposits(tenantId, [this.mapRow(row, viewer, moneyVis, risk)]);
    if (row.status !== AppointmentStatus.CHECKED_IN) return dto!;

    let openEncounterId =
      (
        await this.prisma.encounter.findFirst({
          where: {
            tenantId,
            appointmentId: row.id,
            status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
          },
          select: { id: true },
        })
      )?.id ?? null;

    if (!openEncounterId) {
      openEncounterId = await this.prisma.$transaction((tx) =>
        ensureDraftEncounterIfCheckedIn(tx, tenantId, row.id),
      );
    }

    let withEncounter = { ...dto, openEncounterId };
    if (openEncounterId) {
      const receivable = await getEncounterVisitFeeReceivableSummary(this.prisma, tenantId, openEncounterId);
      if (receivable && dto.financialsVisible !== false) {
        withEncounter = {
          ...withEncounter,
          visitBalanceDueAmount: receivable.amount,
          visitBalanceDueCurrency: receivable.currency,
          visitBalanceRevenueId: receivable.revenueEntryId,
        };
      }
    }
    return withEncounter;
  }

  async list(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    fromStr?: string,
    toStr?: string,
    patientMrn?: string,
    patientSearch?: string,
    patientIdStr?: string,
    statusStr?: string,
    clinicIdStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    bookableOnlyStr?: string,
    bookingSourceStr?: string,
    viewer?: JwtUser
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["startsAt", "endsAt", "status", "createdAt"] as const, "startsAt");
    const sortDir = parseSortOrder(sortOrderStr);

    const and: Prisma.AppointmentWhereInput[] = [{ tenantId }];

    const from = fromStr?.trim();
    const to = toStr?.trim();
    if (from && to) {
      const start = new Date(from);
      const end = new Date(to);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        and.push({ startsAt: { gte: start, lte: end } });
      }
    }

    const mrn = patientMrn?.trim();
    if (mrn) {
      and.push({ patient: { mrn: { contains: mrn, mode: "insensitive" } } });
    }

    const pid = patientIdStr?.trim();
    if (pid) {
      and.push({ patientId: pid });
    }

    const broad = patientSearch?.trim() ?? "";
    if (broad.length > 0) {
      and.push({
        patient: {
          is: {
            deletedAt: null,
            OR: [
              { mrn: { contains: broad, mode: "insensitive" } },
              { nationalId: { contains: broad, mode: "insensitive" } },
              { phone: { contains: broad, mode: "insensitive" } },
              { firstNameEn: { contains: broad, mode: "insensitive" } },
              { lastNameEn: { contains: broad, mode: "insensitive" } },
            ],
          },
        },
      });
    }

    const bookableOnly = bookableOnlyStr?.trim().toLowerCase() === "true" || bookableOnlyStr === "1";
    if (bookableOnly) {
      and.push({
        status: {
          in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
        },
      });
      and.push({
        encounters: {
          none: {
            status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
          },
        },
      });
    }

    const st = statusStr?.trim().toUpperCase();
    if (st && (Object.values(AppointmentStatus) as string[]).includes(st)) {
      and.push({ status: st as AppointmentStatus });
    }

    const bs = bookingSourceStr?.trim().toUpperCase();
    if (bs && (Object.values(BookingSource) as string[]).includes(bs)) {
      and.push({ bookingSource: bs as BookingSource });
    }

    const clinicId = clinicIdStr?.trim();

    if (viewer && isPhysicianRole(viewer.role)) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.length) {
        return paginate([], 0, page, pageSize);
      }
      and.push({ clinicianId: viewer.userId });
      if (clinicId) {
        if (!net.includes(clinicId)) {
          return paginate([], 0, page, pageSize);
        }
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: net } });
      }
    } else if (viewer && hasAnyRoleInSet(viewer, CLINIC_SCOPE_ROLES)) {
      const scopes = await this.prisma.clinicAdminScope.findMany({
        where: { tenantId, userId: viewer.userId },
        select: { clinicId: true },
      });
      const ids = scopes.map((s) => s.clinicId);
      if (!ids.length) {
        return paginate([], 0, page, pageSize);
      }
      if (clinicId) {
        if (!ids.includes(clinicId)) {
          return paginate([], 0, page, pageSize);
        }
        and.push({ clinicId });
      } else {
        and.push({ clinicId: { in: ids } });
      }
    } else if (clinicId) {
      and.push({ clinicId });
    }

    const where: Prisma.AppointmentWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
        include: appointmentDtoInclude,
      }),
    ]);
    const [moneyVis, risk] = await Promise.all([this.moneyOverrides(tenantId, viewer), this.noShowRiskContext(tenantId)]);
    return paginate(
      await this.attachDeposits(
        tenantId,
        rows.map((r: AppointmentRow) => this.mapRow(r, viewer, moneyVis, risk)),
      ),
      total,
      page,
      pageSize
    );
  }

  private async findSchedulingConflicts(
    tenantId: string,
    clinicianId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<AppointmentRow[]> {
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clinicianId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { gte: dayStart, lte: dayEnd },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: appointmentDtoInclude,
    });

    return candidates.filter((c) => {
      const cEnd = effectiveAppointmentEnd(c.startsAt, c.endsAt);
      return appointmentIntervalsOverlap(start, end, c.startsAt, cEnd);
    });
  }

  async listSchedulingConflicts(
    tenantId: string,
    viewer: JwtUser,
    clinicianId: string,
    startsAt: string,
    endsAt?: string,
  ): Promise<AppointmentDto[]> {
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    let end: Date;
    try {
      end = resolveCreateAppointmentEnd(start, endsAt);
    } catch {
      throw new BadRequestException("endsAt must be after startsAt");
    }
    const conflicts = await this.findSchedulingConflicts(tenantId, clinicianId.trim(), start, end);
    for (const row of conflicts) {
      await this.assertAppointmentAccess(viewer, row);
    }
    return conflicts.map((c) => this.mapRow(c));
  }

  async createForIntegration(
    tenantId: string,
    dto: CreateAppointmentDto & {
      integrationClientId?: string | null;
      externalReference?: string;
      bookingSource?: BookingSource;
      attributionJson?: Record<string, unknown>;
    },
  ): Promise<AppointmentDto> {
    if (dto.externalReference && dto.integrationClientId) {
      const existing = await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          integrationClientId: dto.integrationClientId,
          externalReference: dto.externalReference,
        },
        include: appointmentDtoInclude,
      });
      if (existing) return this.mapRow(existing);
    }
    return this.createInternal(tenantId, dto, {
      integrationClientId: dto.integrationClientId ?? undefined,
      externalReference: dto.externalReference ?? null,
      bookingSource: dto.bookingSource,
      attributionJson: dto.attributionJson ?? null,
    });
  }

  async getByIdForIntegration(
    tenantId: string,
    id: string,
    integrationClientId?: string | null,
    clinicId?: string,
  ): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        ...(integrationClientId ? { integrationClientId } : {}),
        ...(clinicId ? { clinicId } : {}),
      },
      include: appointmentDtoInclude,
    });
    if (!row) throw new NotFoundException("Appointment not found");
    return this.mapRow(row);
  }

  async cancelForIntegration(
    tenantId: string,
    id: string,
    integrationClientId?: string | null,
    clinicId?: string,
  ): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        ...(integrationClientId ? { integrationClientId } : {}),
        ...(clinicId ? { clinicId } : {}),
      },
      include: appointmentDtoInclude,
    });
    if (!row) throw new NotFoundException("Appointment not found");
    if (row.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot cancel a completed appointment");
    }
    const previousStatus = row.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CANCELLED },
        include: appointmentDtoInclude,
      });
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId: row.id,
          clinicId: row.clinicId,
          previousStatus,
          nextStatus: AppointmentStatus.CANCELLED,
          bookingSource: row.bookingSource,
          cancelledByPatient: integrationClientId == null,
        },
        tx,
      );
      return row;
    });
    await this.scheduling.recordFreedSlot(tenantId, updated.id);
    return this.mapRow(updated);
  }

  /** FS-04 — the deposit link ran out unpaid and the clinic policy auto-cancels; the slot is freed. */
  async cancelForUnpaidDeposit(tenantId: string, id: string): Promise<boolean> {
    const creditIntents: BilledReversalCreditIntent[] = [];
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id, tenantId } });
      if (!existing || (existing.status !== AppointmentStatus.SCHEDULED && existing.status !== AppointmentStatus.CONFIRMED)) {
        return null;
      }
      const row = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: "SYSTEM",
          cancellationReason: "Deposit not paid in time",
          depositRefundable: true,
        },
      });
      const credit = await this.commissionCharges.onCancelOrNoShow(tx, tenantId, id);
      if (credit) creditIntents.push(credit);
      await tx.auditLog.create({
        data: {
          tenantId,
          clinicId: row.clinicId,
          action: "APPOINTMENT_AUTO_CANCELLED_UNPAID_DEPOSIT",
          resource: "Appointment",
          resourceId: id,
          metadata: { previousStatus: existing.status },
        },
      });
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId: row.id,
          clinicId: row.clinicId,
          previousStatus: existing.status,
          nextStatus: AppointmentStatus.CANCELLED,
          bookingSource: row.bookingSource,
          cancelledByPatient: false,
          metadata: { cancelledBy: "SYSTEM", cancellationReason: row.cancellationReason, depositRefundable: true },
        },
        tx,
      );
      return row;
    });
    if (!row) return false;
    await this.commissionCharges.applyCreditIntents(creditIntents);
    await this.scheduling.recordFreedSlot(tenantId, row.id);
    await this.invalidateSlotsForAppointment(tenantId, row.clinicId, row.clinicianId, "deposit_unpaid_cancel");
    return true;
  }

  async create(tenantId: string, actor: JwtUser, dto: CreateAppointmentDto): Promise<AppointmentDto> {
    if (isPhysicianRole(actor.role) && dto.clinicianId.trim() !== actor.userId) {
      throw new BadRequestException("Physicians may only book appointments as themselves");
    }
    return this.createInternal(tenantId, dto, {}, actor);
  }

  private async createInternal(
    tenantId: string,
    dto: CreateAppointmentDto,
    integration: {
      integrationClientId?: string;
      externalReference?: string | null;
      bookingSource?: BookingSource;
      attributionJson?: Record<string, unknown> | null;
    },
    actor?: JwtUser,
  ): Promise<AppointmentDto> {
    const [clinic, patient, clinician] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId, deletedAt: null } }),
      findActiveSchedulingPhysician(this.prisma, tenantId, dto.clinicianId),
    ]);
    if (!clinic || !patient || !clinician) throw new BadRequestException("Invalid clinic, patient, or clinician");
    await assertClinicianBillingSeatActive(this.prisma, tenantId, dto.clinicianId);
    const start = new Date(dto.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    const apptType = dto.appointmentTypeId
      ? await this.prisma.appointmentType.findFirst({ where: { id: dto.appointmentTypeId, tenantId } })
      : null;
    let effective = null;
    if (dto.appointmentTypeId && apptType) {
      try {
        effective = await this.scheduling.assertAppointmentTypeBookingRules(
          tenantId,
          dto.clinicId,
          dto.patientId,
          dto.clinicianId.trim(),
          dto.appointmentTypeId,
          start,
          dto.roomLabel,
        );
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw err;
      }
    }
    let end: Date;
    try {
      end = dto.endsAt
        ? resolveCreateAppointmentEnd(start, dto.endsAt)
        : this.scheduling.resolveDurationFromType(effective ?? apptType, null, start);
    } catch {
      throw new BadRequestException("endsAt must be after startsAt");
    }

    const { blockStart, blockEnd } = this.scheduling.expandConflictWindow(start, end, effective);
    let conflicts = await this.findSchedulingConflicts(tenantId, dto.clinicianId.trim(), blockStart, blockEnd);
    if (dto.allowDoubleBook) conflicts = [];
    if (conflicts.length > 0 && !dto.confirmOverlap) {
      throw new ConflictException({
        message: "This clinician already has an appointment during this time.",
        conflicts: conflicts.map((c) => this.mapRow(c)),
      });
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException("Tenant not found");
    const defaultFee = Number(tenant.defaultVisitFee);
    const typeFee = effective ? effective.feeAmount : apptType ? Number(apptType.feeAmount) : null;
    const clinicianIdForFees = dto.clinicianId.trim();
    const moneyVis = actor ? await this.moneyOverrides(tenantId, actor) : DEFAULT_MONEY_VISIBILITY_OVERRIDES;
    const canSetFees = actor ? canEditAppointmentFeesForViewer(actor, clinicianIdForFees, moneyVis) : true;
    const feeRaw = canSetFees
      ? dto.feeAmount !== undefined && dto.feeAmount !== null
        ? Number(dto.feeAmount)
        : typeFee != null
          ? typeFee
          : defaultFee
      : typeFee != null
        ? typeFee
        : defaultFee;
    const feeAmount = Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : defaultFee;

    const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
    const scheduleInput = canSetFees
      ? dto.scheduledFeeCollection ?? (feeAmount > 0 ? { mode: VisitCollectionMode.CASH_ON_VISIT } : undefined)
      : feeAmount > 0
        ? { mode: VisitCollectionMode.CASH_ON_VISIT }
        : undefined;
    const scheduledPlan = parseScheduledFeeCollection(feeAmount, scheduleInput, {
      allowedTransferChannels: transferCtx.allowedTransferChannels,
    });

    const bookingSource =
      integration.bookingSource ??
      dto.bookingSource ??
      (integration.integrationClientId ? BookingSource.INTEGRATION : BookingSource.FRONT_DESK);
    const attributionJson =
      integration.attributionJson ?? dto.attributionJson ?? null;
    const newPatientStamp = await this.newPatients.stampNewPatientAtBooking(tenantId, dto.patientId, start);

    const row = await this.prisma.appointment.create({
      data: {
        tenantId,
        clinicId: dto.clinicId,
        patientId: dto.patientId,
        clinicianId: dto.clinicianId,
        appointmentTypeId: dto.appointmentTypeId ?? null,
        seriesId: dto.seriesId ?? null,
        roomLabel: dto.roomLabel ?? null,
        allowDoubleBook: dto.allowDoubleBook ?? false,
        startsAt: start,
        endsAt: end,
        feeAmount,
        scheduledCollectionMode: scheduledPlan.scheduledCollectionMode,
        scheduledTransferChannel: scheduledPlan.scheduledTransferChannel,
        status: dto.status ?? AppointmentStatus.SCHEDULED,
        notes: dto.notes ?? null,
        integrationClientId: integration.integrationClientId ?? null,
        externalReference: integration.externalReference ?? null,
        bookingSource,
        attributionJson: attributionJson ? (attributionJson as Prisma.InputJsonValue) : undefined,
        isNewPatientAtBooking: newPatientStamp.isNewPatientAtBooking,
        newPatientCheckedAt: newPatientStamp.newPatientCheckedAt,
      },
      include: appointmentDtoInclude,
    });
    if (row.status === AppointmentStatus.CONFIRMED) {
      await this.appointmentOutbox.emitStatusChange({
        tenantId,
        appointmentId: row.id,
        clinicId: row.clinicId,
        previousStatus: AppointmentStatus.SCHEDULED,
        nextStatus: row.status,
        bookingSource: row.bookingSource,
      });
    }
    await this.invalidateSlotsForAppointment(tenantId, row.clinicId, row.clinicianId, "appointment_created");
    return this.finishAppointmentDto(tenantId, row, actor);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: AppointmentStatus,
    viewer?: JwtUser,
    cancellationReason?: string | null,
  ): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: appointmentDtoInclude,
    });
    if (!existing) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, existing);
    if (existing.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot change status of a completed appointment");
    }
    if (status === AppointmentStatus.COMPLETED) {
      await assertNoOpenEncounterForAppointmentComplete(this.prisma, tenantId, id);
      await assertScheduledTransferFeeCollected(this.prisma, tenantId, id);
    }
    const cancelPatch = clinicCancellationPatch(existing, status, cancellationReason);
    const creditIntents: BilledReversalCreditIntent[] = [];
    const row = await this.prisma.$transaction(async (tx) => {
      let patch: Prisma.AppointmentUpdateInput;
      let credit: BilledReversalCreditIntent | null = null;
      if (isRevertingAppointmentCheckIn(existing.status, status)) {
        patch = buildRevertCheckInPatch(status);
        await deleteDraftEncountersOnCheckInRevert(tx, tenantId, id);
        credit = await this.commissionCharges.onRevert(tx, tenantId, id, "check_in_reverted");
      } else if (status === AppointmentStatus.CHECKED_IN && existing.status !== AppointmentStatus.CHECKED_IN) {
        patch = await this.frontDeskFlow.buildCheckInStatusPatch(tx, tenantId, existing.clinicId, {
          existingPreferred: existing.preferredRoomLabel ?? existing.roomLabel,
        });
      } else {
        patch = { status, ...cancelPatch };
      }
      const row = await tx.appointment.update({
        where: { id },
        data: patch,
        include: appointmentDtoInclude,
      });
      if (cancelPatch) {
        await auditClinicCancellation(tx, {
          tenantId,
          actorId: viewer?.userId ?? null,
          clinicId: row.clinicId,
          appointmentId: row.id,
          patientId: row.patientId,
          bookingSource: row.bookingSource,
          reason: row.cancellationReason,
        });
      }
      if (!isRevertingAppointmentCheckIn(existing.status, status)) {
        await ensureDraftEncounterIfCheckedIn(tx, tenantId, id);
      }
      if (status === AppointmentStatus.CHECKED_IN && existing.status !== AppointmentStatus.CHECKED_IN) {
        await this.commissionCharges.onCheckIn(tx, tenantId, id, row.checkedInAt ?? new Date());
      } else if (
        status === AppointmentStatus.CANCELLED ||
        status === AppointmentStatus.NO_SHOW
      ) {
        const c = await this.commissionCharges.onCancelOrNoShow(tx, tenantId, id);
        if (c) credit = c;
      } else if (status === AppointmentStatus.COMPLETED) {
        await this.commissionCharges.onComplete(tx, tenantId, id);
      }
      if (credit) creditIntents.push(credit);
      await this.depositSettlement.settleAppointmentDepositsTx(tx, tenantId, row.id, viewer?.userId ?? null);
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId: row.id,
          clinicId: row.clinicId,
          previousStatus: existing.status,
          nextStatus: row.status,
          bookingSource: row.bookingSource,
          cancelledByPatient: false,
          metadata: cancelPatch ? clinicCancellationEventMetadata(row) : undefined,
        },
        tx,
      );
      return row;
    });
    await this.commissionCharges.applyCreditIntents(creditIntents);
    if (status === AppointmentStatus.CANCELLED) {
      await this.scheduling.recordFreedSlot(tenantId, row.id);
    }
    await this.invalidateSlotsForAppointment(tenantId, row.clinicId, row.clinicianId, "appointment_status_changed");
    return this.finishAppointmentDto(tenantId, row, viewer);
  }

  async getById(tenantId: string, id: string, viewer?: JwtUser): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: appointmentDtoInclude,
    });
    if (!row) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, row);
    return this.finishAppointmentDto(tenantId, row, viewer);
  }

  private isCompletedStatus(s: AppointmentStatus): boolean {
    return s === AppointmentStatus.COMPLETED;
  }

  async update(tenantId: string, id: string, dto: UpdateAppointmentDto, viewer?: JwtUser): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, existing);
    if (this.isCompletedStatus(existing.status)) {
      throw new BadRequestException("This appointment is read-only (completed)");
    }

    const nextStarts = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const nextEnds =
      dto.endsAt !== undefined
        ? dto.endsAt === null || String(dto.endsAt).trim() === ""
          ? null
          : new Date(dto.endsAt)
        : existing.endsAt;
    if (nextEnds != null && nextEnds <= nextStarts) throw new BadRequestException("endsAt must be after startsAt");

    const clinicId = dto.clinicId ?? existing.clinicId;
    const patientId = dto.patientId ?? existing.patientId;
    const clinicianId = dto.clinicianId ?? existing.clinicianId;

    if (dto.clinicId !== undefined || dto.patientId !== undefined || dto.clinicianId !== undefined) {
      const [clinic, patient, clinician] = await Promise.all([
        this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } }),
        this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } }),
        findActiveSchedulingPhysician(this.prisma, tenantId, clinicianId),
      ]);
      if (!clinic || !patient || !clinician) throw new BadRequestException("Invalid clinic, patient, or clinician");
    }

    const feeProvided = dto.feeAmount !== undefined && dto.feeAmount !== null;
    if (feeProvided) {
      const newFee = Number(dto.feeAmount);
      if (!Number.isFinite(newFee) || newFee < 0) {
        throw new BadRequestException("feeAmount must be a non-negative number");
      }
    }

    const moneyVis = viewer ? await this.moneyOverrides(tenantId, viewer) : DEFAULT_MONEY_VISIBILITY_OVERRIDES;
    const touchesFees = feeProvided || dto.scheduledFeeCollection !== undefined;
    if (
      viewer &&
      touchesFees &&
      !canEditAppointmentFeesForViewer(viewer, clinicianId, moneyVis)
    ) {
      throw new ForbiddenException("You do not have permission to edit appointment fees");
    }

    const nextStatus = dto.status !== undefined ? dto.status : undefined;
    if (nextStatus === AppointmentStatus.COMPLETED) {
      await assertNoOpenEncounterForAppointmentComplete(this.prisma, tenantId, id);
      await assertScheduledTransferFeeCollected(this.prisma, tenantId, id);
    }
    const cancelPatch = clinicCancellationPatch(existing, nextStatus, dto.cancellationReason);

    const transferCtx = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, tenantId);
    let scheduledPatch: {
      scheduledCollectionMode?: VisitCollectionMode | null;
      scheduledTransferChannel?: string | null;
    } = {};
    if (dto.scheduledFeeCollection !== undefined) {
      const nextFee = feeProvided
        ? Number(dto.feeAmount)
        : Number(existing.feeAmount);
      if (dto.scheduledFeeCollection === null) {
        scheduledPatch = { scheduledCollectionMode: null, scheduledTransferChannel: null };
      } else {
        const plan = parseScheduledFeeCollection(nextFee, dto.scheduledFeeCollection, {
          allowedTransferChannels: transferCtx.allowedTransferChannels,
        });
        scheduledPatch = {
          scheduledCollectionMode: plan.scheduledCollectionMode,
          scheduledTransferChannel: plan.scheduledTransferChannel,
        };
      }
    } else if (feeProvided && Number(dto.feeAmount) <= 0) {
      scheduledPatch = { scheduledCollectionMode: null, scheduledTransferChannel: null };
    }

    const creditIntents: BilledReversalCreditIntent[] = [];
    const row = await this.prisma.$transaction(async (tx) => {
      const reverting =
        nextStatus !== undefined && isRevertingAppointmentCheckIn(existing.status, nextStatus);
      if (reverting && nextStatus !== undefined) {
        await deleteDraftEncountersOnCheckInRevert(tx, tenantId, id);
        const credit = await this.commissionCharges.onRevert(tx, tenantId, id, "check_in_reverted");
        if (credit) creditIntents.push(credit);
      }
      const checkIn =
        !reverting &&
        nextStatus === AppointmentStatus.CHECKED_IN &&
        existing.status !== AppointmentStatus.CHECKED_IN
          ? await this.frontDeskFlow.buildCheckInStatusPatch(tx, tenantId, existing.clinicId, {
              existingPreferred: existing.preferredRoomLabel ?? existing.roomLabel,
            })
          : null;
      const statusFields = reverting && nextStatus !== undefined
        ? buildRevertCheckInPatch(nextStatus)
        : checkIn ?? (nextStatus !== undefined ? { status: nextStatus } : {});

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          clinicId,
          patientId,
          clinicianId,
          startsAt: dto.startsAt !== undefined ? new Date(dto.startsAt) : undefined,
          endsAt:
            dto.endsAt !== undefined
              ? dto.endsAt === null || String(dto.endsAt).trim() === ""
                ? null
                : new Date(dto.endsAt)
              : undefined,
          notes: dto.notes !== undefined ? (dto.notes === "" ? null : dto.notes) : undefined,
          ...(feeProvided ? { feeAmount: new Prisma.Decimal(String(Number(dto.feeAmount))) } : {}),
          ...scheduledPatch,
          ...statusFields,
          ...cancelPatch,
        },
        include: appointmentDtoInclude,
      });
      if (cancelPatch) {
        await auditClinicCancellation(tx, {
          tenantId,
          actorId: viewer?.userId ?? null,
          clinicId: updated.clinicId,
          appointmentId: updated.id,
          patientId: updated.patientId,
          bookingSource: updated.bookingSource,
          reason: updated.cancellationReason,
        });
      }

      if (!reverting) {
        await ensureDraftEncounterIfCheckedIn(tx, tenantId, id);
      }

      if (
        !reverting &&
        nextStatus === AppointmentStatus.CHECKED_IN &&
        existing.status !== AppointmentStatus.CHECKED_IN
      ) {
        await this.commissionCharges.onCheckIn(tx, tenantId, id, updated.checkedInAt ?? new Date());
      }

      if (feeProvided) {
        await syncOpenEncounterVisitFeeFromAppointment(tx, tenantId, id, Number(dto.feeAmount));
      }

      if (updated.startsAt.getTime() !== existing.startsAt.getTime()) {
        await this.appointmentOutbox.emitRescheduled(
          tenantId,
          updated.id,
          updated.clinicId,
          updated.startsAt.toISOString(),
          tx,
        );
      }
      if (nextStatus !== undefined && nextStatus !== existing.status) {
        await this.appointmentOutbox.emitStatusChange(
          {
            tenantId,
            appointmentId: updated.id,
            clinicId: updated.clinicId,
            previousStatus: existing.status,
            nextStatus: updated.status,
            bookingSource: updated.bookingSource,
            cancelledByPatient: false,
            metadata: cancelPatch ? clinicCancellationEventMetadata(updated) : undefined,
          },
          tx,
        );
      }

      return updated;
    });
    await this.commissionCharges.applyCreditIntents(creditIntents);
    await this.invalidateSlotsForAppointment(tenantId, row.clinicId, row.clinicianId, "appointment_updated");
    if (existing.clinicianId !== row.clinicianId) {
      await this.invalidateSlotsForAppointment(tenantId, row.clinicId, existing.clinicianId, "appointment_updated");
    }
    return this.finishAppointmentDto(tenantId, row, viewer);
  }

  private assertCanDeleteAppointment(viewer: JwtUser): void {
    assertOrgClinicalDeleteRole(viewer, "appointments");
  }

  async delete(tenantId: string, id: string, viewer: JwtUser): Promise<{ ok: true; id: string }> {
    this.assertCanDeleteAppointment(viewer);
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    await this.commissionCharges.beforeAppointmentDelete(tenantId, id);
    await this.prisma.appointment.delete({ where: { id } });
    await this.invalidateSlotsForAppointment(
      tenantId,
      existing.clinicId,
      existing.clinicianId,
      "appointment_deleted",
    );
    return { ok: true, id };
  }
}
