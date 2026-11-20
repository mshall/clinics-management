import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { CarePlanRequestService } from "./care-plan-request.service";
import { CarePlanService, type CarePlanInput } from "./care-plan.service";
import { FamilyUpdateService } from "./family-update.service";
import { NurseReportsService } from "./nurse-reports.service";
import { ShiftService } from "./shift.service";
import { VisitRecordService, type VisitRecordPatch } from "./visit-record.service";
import type { VitalsInput } from "./vitals";

/** KNCP (care plans), KNREC (visit record, vitals), KNESC (escalation), KNSH (shifts), KNFAM (family), KNRPT (reports). Flags are enforced inside the services (new capabilities only). */
@ApiTags("nurse")
@ApiBearerAuth("bearer")
@Controller("nurse")
@UseGuards(JwtAuthGuard, ScopeGuard)
export class NurseClinicalController {
  constructor(
    private readonly plans: CarePlanService,
    private readonly planRequests: CarePlanRequestService,
    private readonly records: VisitRecordService,
    private readonly shifts: ShiftService,
    private readonly family: FamilyUpdateService,
    private readonly reports: NurseReportsService,
  ) {}

  // ---- care plans ----
  @Post("care-plans")
  @RequiresScope("home_visits.perform")
  createPlan(@CurrentUser() u: JwtUser, @Body() b: CarePlanInput) {
    return this.plans.create(requireTenantId(u), u, b);
  }

  @Get("care-plans")
  listPlans(@CurrentUser() u: JwtUser, @Query("patientId") patientId?: string, @Query("status") status?: string) {
    return this.plans.list(requireTenantId(u), { patientId, status });
  }

  @Get("care-plans/:id")
  getPlan(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.plans.get(requireTenantId(u), id);
  }

  @Post("care-plans/:id/pause")
  @HttpCode(200)
  pausePlan(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.plans.pause(requireTenantId(u), u, id);
  }

  @Post("care-plans/:id/resume")
  @HttpCode(200)
  resumePlan(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { startDate: string; visitAddress: unknown }) {
    return this.plans.resume(requireTenantId(u), u, id, b);
  }

  @Post("care-plans/:id/extend")
  @HttpCode(200)
  extendPlan(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { startDate: string; extraDays: number; visitAddress: unknown }) {
    return this.plans.extend(requireTenantId(u), u, id, b);
  }

  @Post("care-plans/:id/end")
  @HttpCode(200)
  endPlan(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { reason: "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_PROVIDER" | "EXPIRED"; dischargeNote: string }) {
    return this.plans.end(requireTenantId(u), u, id, b);
  }

  @Post("care-plans/:id/share-discharge")
  @HttpCode(200)
  shareDischarge(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.plans.shareDischarge(requireTenantId(u), id);
  }

  // ---- care-plan inbox (Kiorex P3 requests; reading is never gated, accepting creates a plan and is gated by nurse.care_plans) ----
  @Get("care-plan-requests")
  listPlanRequests(@CurrentUser() u: JwtUser, @Query("status") status?: string) {
    return this.planRequests.list(requireTenantId(u), status);
  }

  @Post("care-plan-requests/:id/accept")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  acceptPlanRequest(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: Parameters<CarePlanRequestService["accept"]>[3]) {
    return this.planRequests.accept(requireTenantId(u), u, id, b);
  }

  @Post("care-plan-requests/:id/decline")
  @HttpCode(200)
  declinePlanRequest(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { reason?: string }) {
    return this.planRequests.decline(requireTenantId(u), u, id, b?.reason);
  }

  // ---- visit record / vitals ----
  @Get("visits/:appointmentId/record")
  @RequiresScope("encounter.template.nursing")
  record(@CurrentUser() u: JwtUser, @Param("appointmentId") id: string) {
    return this.records.getOrCreate(requireTenantId(u), u, id);
  }

  @Put("visits/:appointmentId/record")
  @RequiresScope("encounter.template.nursing")
  updateRecord(@CurrentUser() u: JwtUser, @Param("appointmentId") id: string, @Body() b: VisitRecordPatch) {
    return this.records.update(requireTenantId(u), u, id, b ?? {});
  }

  @Post("visits/:appointmentId/record/sign")
  @HttpCode(200)
  @RequiresScope("encounter.sign")
  sign(@CurrentUser() u: JwtUser, @Param("appointmentId") id: string) {
    return this.records.sign(requireTenantId(u), u, id);
  }

  @Post("patients/:patientId/vitals")
  @RequiresScope("vitals.record")
  vitals(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string, @Body() b: VitalsInput & { appointmentId?: string }) {
    const { appointmentId, ...v } = b ?? {};
    return this.records.recordVitals(requireTenantId(u), u, patientId, appointmentId ?? null, v);
  }

  @Get("patients/:patientId/vitals/trend")
  trend(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string) {
    return this.records.trend(requireTenantId(u), patientId);
  }

  @Post("vitals/:id/escalation")
  @HttpCode(200)
  @RequiresScope("vitals.record")
  escalation(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { action: string; note?: string }) {
    return this.records.logEscalation(requireTenantId(u), u, id, b);
  }

  // ---- shifts ----
  @Post("shifts")
  bookShift(@CurrentUser() u: JwtUser, @Body() b: { patientId: string; nurseId: string; startsAt: string; durationHours: number }) {
    return this.shifts.book(requireTenantId(u), u, b);
  }

  @Get("shifts")
  listShifts(@CurrentUser() u: JwtUser, @Query("nurseId") nurseId?: string) {
    return this.shifts.list(requireTenantId(u), u, { nurseId });
  }

  @Post("shifts/:id/check-in")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  checkIn(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { lat: number; lng: number }) {
    return this.shifts.checkIn(requireTenantId(u), u, id, b);
  }

  @Post("shifts/:id/check-out")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  checkOut(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { lat: number; lng: number; handoverNote?: string; handoverToNurseId?: string }) {
    return this.shifts.checkOut(requireTenantId(u), u, id, b);
  }

  @Get("patients/:patientId/handover")
  handover(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string) {
    return this.shifts.handoverFor(requireTenantId(u), u, patientId);
  }

  // ---- family + reports ----
  @Post("visits/:appointmentId/family-update")
  @HttpCode(200)
  familyUpdate(@CurrentUser() u: JwtUser, @Param("appointmentId") id: string) {
    return this.family.sendForVisit(requireTenantId(u), id);
  }

  @Get("reports/summary")
  summary(@CurrentUser() u: JwtUser, @Query("from") from: string, @Query("to") to: string, @Query("nurseId") nurseId?: string) {
    const f = new Date(from);
    const t = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t <= f) throw new BadRequestException("Invalid from/to");
    return this.reports.summary(requireTenantId(u), { from: f, to: t, nurseId });
  }
}
