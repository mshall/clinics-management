import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HomeVisitState, PaymentMethod, Prisma, Profession, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRole } from "../common/effective-roles";
import { HomeVisitService } from "../home-visits/home-visit.service";
import { PrismaService } from "../prisma/prisma.service";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";

const MANAGERS: UserRole[] = [UserRole.CLINIC_ADMIN, UserRole.GROUP_ADMIN, UserRole.BRANCH_MANAGER];
const isManager = (u: JwtUser) => Boolean(u.isTenantOwner) || hasAnyRole(u, MANAGERS);

/** KNAG01/03/04 — roster, per-nurse pay statements and cash owed, for Nurse AGENCY tenants. Dispatch guards live in HomeVisitService. */
@Injectable()
export class AgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly homeVisits: HomeVisitService,
  ) {}

  async upsertRoster(tenantId: string, actor: JwtUser, userId: string, input: { skills?: string[]; languages?: string[]; payPerVisit?: number | null; payPerShiftHour?: number | null; notes?: string }) {
    if (!isManager(actor)) throw new ForbiddenException("Managers only");
    const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null }, select: { id: true } });
    if (!u) throw new NotFoundException("Staff member not found");
    for (const k of ["payPerVisit", "payPerShiftHour"] as const) if (input[k] != null && (!Number.isFinite(input[k]!) || input[k]! < 0)) throw new BadRequestException(`${k} must be >= 0`);
    const data = { skills: input.skills ?? undefined, languages: input.languages ?? undefined, payPerVisit: input.payPerVisit == null ? undefined : new Prisma.Decimal(input.payPerVisit), payPerShiftHour: input.payPerShiftHour == null ? undefined : new Prisma.Decimal(input.payPerShiftHour), notes: input.notes };
    const row = await this.prisma.nurseRosterProfile.upsert({ where: { tenantId_userId: { tenantId, userId } }, create: { tenantId, userId, ...data }, update: data });
    return { userId, skills: row.skills, languages: row.languages, payPerVisit: row.payPerVisit?.toString() ?? null, payPerShiftHour: row.payPerShiftHour?.toString() ?? null };
  }

  /** KNAG01/04 — the roster: verified nurses are dispatchable; unverified staff and ASSISTANT aides are listed but NEVER dispatchable (never sent alone, never listed on Kiorex). */
  async roster(tenantId: string, actor: JwtUser) {
    if (!isManager(actor) && !hasAnyRole(actor, [UserRole.RECEPTIONIST, UserRole.CALL_CENTER])) throw new ForbiddenException("Managers and dispatchers only");
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null, deactivatedAt: null, OR: [{ profession: { in: [Profession.NURSE, Profession.ASSISTANT] } }, { role: UserRole.NURSE }] },
      select: { id: true, displayName: true, profession: true, role: true, additionalRoles: true },
    });
    const [profiles, settings] = await Promise.all([
      this.prisma.nurseRosterProfile.findMany({ where: { tenantId } }),
      this.prisma.clinicianHomeSettings.findMany({ where: { tenantId } }),
    ]);
    const items = [];
    for (const u of users) {
      const profession = effectiveProfession(u);
      const guard = profession === Profession.ASSISTANT ? { ok: false, reason: "AIDE_NEVER_SENT_ALONE" } : await this.homeVisits.isDispatchable(tenantId, u.id);
      const p = profiles.find((x) => x.userId === u.id);
      const s = settings.find((x) => x.clinicianId === u.id);
      items.push({ userId: u.id, name: u.displayName, kind: profession === Profession.ASSISTANT ? "AIDE" : "NURSE", skills: p?.skills ?? [], languages: p?.languages ?? [], zones: s?.coverageDistrictIds ?? [], restrictToPatientGender: s?.restrictToPatientGender ?? null, dispatchable: guard.ok, notDispatchableReason: guard.ok ? null : guard.reason });
    }
    return { items };
  }

  /** KNAG03 — nurse pay for a period from FINISHED visits (per-visit rate) and COMPLETED shifts (per-hour rate), plus cash the nurse collected at homes. Agency pays the nurse; Kiorex Pay never does. */
  async payStatement(tenantId: string, actor: JwtUser, nurseId: string, from: Date, to: Date) {
    if (!isManager(actor) && actor.userId !== nurseId) throw new ForbiddenException("Managers or the nurse only");
    const [profile, visits, shifts, cash] = await Promise.all([
      this.prisma.nurseRosterProfile.findUnique({ where: { tenantId_userId: { tenantId, userId: nurseId } } }),
      this.prisma.homeVisit.count({ where: { tenantId, clinicianId: nurseId, state: HomeVisitState.FINISHED, finishedAt: { gte: from, lt: to } } }),
      this.prisma.shiftBooking.findMany({ where: { tenantId, nurseId, status: "COMPLETED", checkOutAt: { gte: from, lt: to } }, select: { durationHours: true } }),
      this.prisma.billingPaymentAllocation.aggregate({ where: { method: PaymentMethod.CASH, payment: { tenantId, cashierUserId: nurseId, createdAt: { gte: from, lt: to } } }, _sum: { amount: true } }),
    ]);
    const perVisit = Number(profile?.payPerVisit ?? 0);
    const perHour = Number(profile?.payPerShiftHour ?? 0);
    const shiftHours = shifts.reduce((a, s) => a + s.durationHours, 0);
    const visitPay = visits * perVisit;
    const shiftPay = shiftHours * perHour;
    return {
      nurseId,
      period: { from: from.toISOString(), to: to.toISOString() },
      visits,
      shiftHours,
      visitPay: visitPay.toFixed(2),
      shiftPay: shiftPay.toFixed(2),
      totalPay: (visitPay + shiftPay).toFixed(2),
      /** Cash the nurse collected at homes in the period (reconciles at shift close, MN03): what the nurse owes the agency before pay-out. */
      cashOwedToAgency: Number(cash._sum.amount ?? 0).toFixed(2),
      payRatesConfigured: Boolean(profile?.payPerVisit || profile?.payPerShiftHour),
    };
  }
}
