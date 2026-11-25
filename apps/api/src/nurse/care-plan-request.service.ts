import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { decryptVisitAddress, encryptVisitAddress } from "../home-visits/address-crypto";
import { HomeVisitRuleException, OutOfCoverageException } from "../home-visits/home-visit.errors";
import { districtSlug, parseVisitAddress, VisitAddressError } from "../home-visits/visit-address";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import { PrismaService } from "../prisma/prisma.service";
import { CarePlanService } from "./care-plan.service";
import type { CarePlanItem } from "./care-plan-schedule";
import { parseAcquisitionBlock } from "../growth/acquisition-contract";

/** Contracts 1.5.0 `CarePlanRequest` (P3 DRAFT). */
export type CarePlanRequestBody = {
  requestRef: string;
  clinicId: string;
  clinicianId?: string;
  typeId?: string;
  preferredStartDate?: string;
  notes?: string;
  visitAddress?: unknown;
  patient: { phone: string; firstNameEn: string; lastNameEn: string };
  /** Contracts 1.13.0 (optional): the Kiorex decision evidence. An invalid block is ignored (never a rejection of the request). */
  acquisition?: unknown;
};

export type CarePlanRequestAck = { requestRef: string; status: "RECEIVED" | "DECLINED"; carePlanId: string | null };

const NOTES_MAX = 1000;
const DECLINE_MAX = 500;

/**
 * KX-09 §03 / KX-23 (P3 draft) — Kiorex asks a nurse or agency for a multi-visit care plan.
 * Receive: launch-locked behind `nurse.care_plans` (GKN1, a human gate): 403 FEATURE_DISABLED until the control plane records the evidence. Idempotent on `requestRef`.
 * Inbox: the nurse accepts (creates a real CarePlan through the slot engine, same `requestRef`, which later emits CARE_PLAN_CONFIRMED) or declines.
 * Reading the inbox is never gated (requests already received are honoured).
 */
@Injectable()
export class CarePlanRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
    private readonly patients: MarketplacePatientIntakeService,
    private readonly plans: CarePlanService,
  ) {}

  private ack(r: { requestRef: string; status: string; carePlanId: string | null }): CarePlanRequestAck {
    return { requestRef: r.requestRef, status: r.status === "DECLINED" ? "DECLINED" : "RECEIVED", carePlanId: r.carePlanId };
  }

  /** `POST /marketplace/v1/care-plan-requests`; `tenantId` is resolved from the clinic's LIVE/PAUSED listing by the controller. */
  async receive(tenantId: string, body: CarePlanRequestBody): Promise<CarePlanRequestAck> {
    await requireFeature(this.flags, tenantId, "nurse.care_plans");
    if (!body?.requestRef?.trim() || !body.clinicId?.trim()) throw new BadRequestException("requestRef and clinicId are required");
    const p = body.patient;
    if (!p?.phone?.trim() || !p.firstNameEn?.trim() || !p.lastNameEn?.trim()) throw new BadRequestException("patient.phone, firstNameEn and lastNameEn are required");
    if (body.notes != null && (typeof body.notes !== "string" || body.notes.length > NOTES_MAX)) throw new BadRequestException(`notes must be at most ${NOTES_MAX} characters`);
    let start: Date | null = null;
    if (body.preferredStartDate) {
      start = new Date(`${body.preferredStartDate}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) throw new BadRequestException("preferredStartDate must be YYYY-MM-DD");
    }
    const existing = await this.prisma.carePlanRequest.findUnique({ where: { requestRef: body.requestRef } });
    if (existing) return this.ack(existing);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { edition: true } });
    const homeType = await this.prisma.appointmentType.findFirst({ where: { tenantId, clinicId: body.clinicId, isActive: true, serviceLocation: "HOME", ...(body.typeId ? { id: body.typeId } : {}) }, select: { id: true } });
    if (tenant?.edition !== "NURSE" || !homeType) {
      throw new HomeVisitRuleException("CARE_PLANS_NOT_OFFERED", "This provider does not offer care plans");
    }

    let cipher: string | null = null;
    if (body.visitAddress != null) {
      let address;
      try {
        address = parseVisitAddress(body.visitAddress, { requireLine1: false });
      } catch (e) {
        if (e instanceof VisitAddressError) throw new BadRequestException({ code: e.code, message: e.message });
        throw e;
      }
      if (body.clinicianId) {
        const settings = await this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId: body.clinicianId } } });
        if (settings && settings.coverageDistrictIds.length && !settings.coverageDistrictIds.map(districtSlug).includes(address.district)) {
          throw new OutOfCoverageException(address.district, "DISTRICT_NOT_COVERED");
        }
      }
      cipher = encryptVisitAddress(address, tenantId);
    }
    const parsedAcquisition = parseAcquisitionBlock(body.acquisition);
    const acquisition = parsedAcquisition.ok ? parsedAcquisition.block : null;
    try {
      const row = await this.prisma.carePlanRequest.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          clinicianId: body.clinicianId ?? null,
          typeId: body.typeId ?? null,
          requestRef: body.requestRef.trim(),
          preferredStartDate: start,
          notes: body.notes?.trim() || null,
          visitAddressCiphertext: cipher,
          patientPhone: p.phone.trim(),
          patientFirstName: p.firstNameEn.trim(),
          patientLastName: p.lastNameEn.trim(),
          ...(acquisition ? { acquisition: acquisition as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.recordEvent({ tenantId, actorId: null, clinicId: body.clinicId, action: "care_plan_request.received", resource: "CarePlanRequest", resourceId: row.id, metadata: { requestRef: row.requestRef } });
      return this.ack(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.prisma.carePlanRequest.findUnique({ where: { requestRef: body.requestRef } });
        if (again) return this.ack(again);
      }
      throw e;
    }
  }

  private view(r: Prisma.CarePlanRequestGetPayload<object>, includeAddress: boolean, tenantId: string) {
    const address = includeAddress ? decryptVisitAddress(r.visitAddressCiphertext, tenantId) : null;
    return {
      id: r.id,
      requestRef: r.requestRef,
      status: r.status,
      clinicId: r.clinicId,
      clinicianId: r.clinicianId,
      typeId: r.typeId,
      preferredStartDate: r.preferredStartDate?.toISOString().slice(0, 10) ?? null,
      notes: r.notes,
      patient: { phone: r.patientPhone, firstNameEn: r.patientFirstName, lastNameEn: r.patientLastName },
      district: address?.district ?? null,
      hasAddress: r.visitAddressCiphertext != null,
      carePlanId: r.carePlanId,
      declineReason: r.declineReason,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    };
  }

  async list(tenantId: string, status?: string) {
    const rows = await this.prisma.carePlanRequest.findMany({ where: { tenantId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: rows.map((r) => this.view(r, true, tenantId)) };
  }

  async accept(tenantId: string, actor: JwtUser, id: string, body: { nurseId: string; title?: string; startDate?: string; items: CarePlanItem[]; addressConfirmed?: boolean; servicePackageId?: string | null }) {
    const r = await this.prisma.carePlanRequest.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException("Care plan request not found");
    if (r.status !== "RECEIVED") throw new ConflictException({ code: "CARE_PLAN_REQUEST_DECIDED", message: `The request is already ${r.status}` });
    const address = decryptVisitAddress(r.visitAddressCiphertext, tenantId);
    if (!address) throw new BadRequestException({ code: "VISIT_ADDRESS_REQUIRED", message: "The request carries no visit address" });
    const patientId = await this.patients.resolveOrCreate(tenantId, r.clinicId, { phone: r.patientPhone, firstNameEn: r.patientFirstName, lastNameEn: r.patientLastName });
    const startDate = body.startDate ?? r.preferredStartDate?.toISOString().slice(0, 10);
    if (!startDate) throw new BadRequestException("startDate is required");
    const plan = await this.plans.create(tenantId, actor, {
      clinicId: r.clinicId,
      patientId,
      nurseId: body.nurseId,
      title: body.title?.trim() || `Care plan (${r.patientFirstName} ${r.patientLastName})`,
      startDate,
      items: body.items,
      visitAddress: address,
      addressConfirmed: body.addressConfirmed ?? true,
      servicePackageId: body.servicePackageId ?? null,
      requestRef: r.requestRef,
    });
    await this.prisma.carePlanRequest.update({ where: { id }, data: { status: "ACCEPTED", carePlanId: plan.id, decidedById: actor.userId, decidedAt: new Date() } });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: r.clinicId, action: "care_plan_request.accepted", resource: "CarePlanRequest", resourceId: id, metadata: { carePlanId: plan.id } });
    return plan;
  }

  async decline(tenantId: string, actor: JwtUser, id: string, reason?: string) {
    const r = await this.prisma.carePlanRequest.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException("Care plan request not found");
    if (r.status !== "RECEIVED") throw new ConflictException({ code: "CARE_PLAN_REQUEST_DECIDED", message: `The request is already ${r.status}` });
    const row = await this.prisma.carePlanRequest.update({ where: { id }, data: { status: "DECLINED", declineReason: reason?.trim().slice(0, DECLINE_MAX) || null, decidedById: actor.userId, decidedAt: new Date() } });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: r.clinicId, action: "care_plan_request.declined", resource: "CarePlanRequest", resourceId: id });
    return this.view(row, false, tenantId);
  }
}
