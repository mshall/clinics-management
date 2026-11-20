import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { coarsen } from "@kiorly/field-visit";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { PlanUpgradeRequiredException } from "../entitlements/plan-upgrade-required.exception";
import { PrismaService } from "../prisma/prisma.service";
import { isShiftHours } from "./nurse-services";

/** KNSH01 — private-duty shifts (8/12/24 h): booking, geostamped check-in/out and the handover note between nurses. */
@Injectable()
export class ShiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  async book(tenantId: string, actor: JwtUser, input: { patientId: string; nurseId: string; startsAt: string; durationHours: number }) {
    await requireFeature(this.flags, tenantId, "nurse.private_duty_shifts");
    if (!(await this.entitlements.isEntitled(tenantId, "nurse_private_duty_shifts"))) throw new PlanUpgradeRequiredException("nurse_private_duty_shifts", "NURSE_PRO");
    if (!isShiftHours(input.durationHours)) throw new BadRequestException("durationHours must be 8, 12 or 24");
    const start = new Date(input.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    const end = new Date(start.getTime() + input.durationHours * 3600_000);
    const [patient, nurse] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: input.patientId, tenantId, deletedAt: null }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { id: input.nurseId, tenantId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!patient || !nurse) throw new NotFoundException("Patient or nurse not found");
    const clash = await this.prisma.shiftBooking.findFirst({ where: { tenantId, nurseId: input.nurseId, status: { in: ["BOOKED", "IN_PROGRESS"] }, startsAt: { lt: end }, endsAt: { gt: start } }, select: { id: true } });
    if (clash) throw new ConflictException({ code: "NURSE_BUSY", message: "The nurse already has a shift at this time" });
    const row = await this.prisma.shiftBooking.create({ data: { tenantId, patientId: input.patientId, nurseId: input.nurseId, startsAt: start, endsAt: end, durationHours: input.durationHours } });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: null, action: "shift.booked", resource: "ShiftBooking", resourceId: row.id });
    return this.view(row);
  }

  private view(r: { id: string; patientId: string; nurseId: string; startsAt: Date; endsAt: Date; durationHours: number; status: string; checkInAt: Date | null; checkOutAt: Date | null; handoverNote: string | null; handoverToNurseId: string | null }) {
    return { id: r.id, patientId: r.patientId, nurseId: r.nurseId, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), durationHours: r.durationHours, status: r.status, checkInAt: r.checkInAt?.toISOString() ?? null, checkOutAt: r.checkOutAt?.toISOString() ?? null, handoverNote: r.handoverNote, handoverToNurseId: r.handoverToNurseId };
  }

  private async mine(tenantId: string, nurse: JwtUser, id: string) {
    const s = await this.prisma.shiftBooking.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException("Shift not found");
    if (s.nurseId !== nurse.userId) throw new ForbiddenException("This shift is not assigned to you");
    return s;
  }

  /** Check-in/out carry a coarse geostamp (retention: lat/lng removed after 12 months by the retention job). */
  async checkIn(tenantId: string, nurse: JwtUser, id: string, geo: { lat: number; lng: number }) {
    const s = await this.mine(tenantId, nurse, id);
    if (s.status !== "BOOKED") throw new ConflictException({ code: "SHIFT_STATE", message: `Shift is ${s.status}` });
    const g = coarsen(geo.lat, geo.lng);
    const row = await this.prisma.shiftBooking.update({ where: { id }, data: { status: "IN_PROGRESS", checkInAt: new Date(), checkInLat: g.lat, checkInLng: g.lng } });
    return this.view(row);
  }

  async checkOut(tenantId: string, nurse: JwtUser, id: string, body: { lat: number; lng: number; handoverNote?: string; handoverToNurseId?: string }) {
    const s = await this.mine(tenantId, nurse, id);
    if (s.status !== "IN_PROGRESS") throw new ConflictException({ code: "SHIFT_STATE", message: `Shift is ${s.status}` });
    const g = coarsen(body.lat, body.lng);
    const row = await this.prisma.shiftBooking.update({
      where: { id },
      data: { status: "COMPLETED", checkOutAt: new Date(), checkOutLat: g.lat, checkOutLng: g.lng, handoverNote: body.handoverNote?.slice(0, 4000) ?? null, handoverToNurseId: body.handoverToNurseId ?? null },
    });
    return this.view(row);
  }

  /** The next nurse reads the previous shift's handover note for the same patient. */
  async handoverFor(tenantId: string, nurse: JwtUser, patientId: string) {
    const prev = await this.prisma.shiftBooking.findFirst({ where: { tenantId, patientId, status: "COMPLETED", handoverToNurseId: nurse.userId }, orderBy: { checkOutAt: "desc" } });
    return prev ? { note: prev.handoverNote, fromNurseId: prev.nurseId, at: prev.checkOutAt?.toISOString() ?? null } : { note: null };
  }

  async list(tenantId: string, user: JwtUser, q: { nurseId?: string }) {
    const rows = await this.prisma.shiftBooking.findMany({ where: { tenantId, ...(q.nurseId ? { nurseId: q.nurseId } : {}) }, orderBy: { startsAt: "asc" }, take: 200 });
    return { items: rows.map((r) => this.view(r)) };
  }
}
