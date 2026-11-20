import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { HomeVisitState } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { HomeVisitBookingService, type FrontDeskHomeBookingInput } from "./home-visit-booking.service";
import { HomeVisitConfigService, isHomeVisitManager, type HomeSettingsInput, type HomeTypeInput } from "./home-visit-config.service";
import { HomeVisitExecService } from "./home-visit-exec.service";
import { HomeVisitReportsService } from "./home-visit-reports.service";
import { HomeVisitSafetyService } from "./home-visit-safety.service";
import { HomeVisitService } from "./home-visit.service";

/**
 * Home visits (HV*). Flag use: only NEW capabilities are gated (`clinic.home_visits` on booking / enabling, `clinic.home_route_view`,
 * `clinic.home_dispatch` inside the services). Reads, execution (on my way / arrived / finished) and ALL safety endpoints
 * (SOS, safety prompt, unsafe-abort, alerts) are never gated: booked visits are honoured and safety is not a flag (ADR-025).
 */
@ApiTags("home-visits")
@ApiBearerAuth("bearer")
@Controller("home-visits")
@UseGuards(JwtAuthGuard, ScopeGuard, FeatureGuard)
export class HomeVisitsController {
  constructor(
    private readonly config: HomeVisitConfigService,
    private readonly homeVisits: HomeVisitService,
    private readonly booking: HomeVisitBookingService,
    private readonly exec: HomeVisitExecService,
    private readonly safety: HomeVisitSafetyService,
    private readonly reports: HomeVisitReportsService,
  ) {}

  // ---- configuration (HVCFG) ----
  @Get("settings/me")
  mySettings(@CurrentUser() u: JwtUser) {
    return this.config.getSettings(requireTenantId(u), u.userId);
  }

  @Get("settings/:clinicianId")
  settings(@CurrentUser() u: JwtUser, @Param("clinicianId") clinicianId: string) {
    const tenantId = requireTenantId(u);
    if (clinicianId !== u.userId && !isHomeVisitManager(u)) throw new ForbiddenException("Managers or the clinician only");
    return this.config.getSettings(tenantId, clinicianId);
  }

  @Put("settings/:clinicianId")
  putSettings(@CurrentUser() u: JwtUser, @Param("clinicianId") clinicianId: string, @Body() body: HomeSettingsInput) {
    return this.config.upsertSettings(requireTenantId(u), u, clinicianId, body ?? {});
  }

  @Put("appointment-types/:id")
  configureType(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: HomeTypeInput) {
    return this.config.configureType(requireTenantId(u), u, id, body);
  }

  @Get("safety-contact")
  safetyContact(@CurrentUser() u: JwtUser) {
    return this.config.getSafetyContact(requireTenantId(u));
  }

  @Put("safety-contact")
  putSafetyContact(@CurrentUser() u: JwtUser, @Body() body: { name: string; phone: string }) {
    return this.config.setSafetyContact(requireTenantId(u), u, body);
  }

  // ---- booking (HVBK02): a NEW home booking is launch-locked ----
  @Post("bookings")
  @RequiresFeature("clinic.home_visits")
  book(@CurrentUser() u: JwtUser, @Body() body: FrontDeskHomeBookingInput) {
    // carePlanFollowUp is internal (care-plan generation): a client can never skip the first-home-visit safeguard (HVSAF03).
    return this.booking.bookFromFrontDesk(requireTenantId(u), u, { ...body, carePlanFollowUp: undefined });
  }

  // ---- reads ----
  @Get()
  list(@CurrentUser() u: JwtUser, @Query("from") from?: string, @Query("to") to?: string, @Query("state") state?: string, @Query("clinicianId") clinicianId?: string) {
    if (state && !(state in HomeVisitState)) throw new BadRequestException("Invalid state");
    return this.homeVisits.list(requireTenantId(u), u, { from, to, state: state as HomeVisitState | undefined, clinicianId });
  }

  @Get("route")
  route(@CurrentUser() u: JwtUser, @Query("date") date?: string, @Query("clinicianId") clinicianId?: string) {
    return this.homeVisits.route(requireTenantId(u), u, { date, clinicianId });
  }

  @Get("reports")
  async report(@CurrentUser() u: JwtUser, @Query("from") from: string, @Query("to") to: string, @Query("clinicId") clinicId?: string) {
    const tenantId = requireTenantId(u);
    if (!isHomeVisitManager(u)) throw new ForbiddenException("Managers only");
    const f = new Date(from);
    const t = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t <= f) throw new BadRequestException("Invalid from/to");
    return this.reports.split(tenantId, { from: f, to: t, clinicId });
  }

  @Get("safety-alerts")
  async alerts(@CurrentUser() u: JwtUser) {
    if (!isHomeVisitManager(u)) throw new ForbiddenException("Managers only");
    return { items: await this.safety.listAlerts(requireTenantId(u)) };
  }

  @Post("safety-alerts/:alertId/ack")
  @HttpCode(200)
  async ack(@CurrentUser() u: JwtUser, @Param("alertId") alertId: string) {
    if (!isHomeVisitManager(u)) throw new ForbiddenException("Managers only");
    return this.safety.acknowledge(requireTenantId(u), alertId, u.userId);
  }

  @Post("safety-alerts/:alertId/resolve")
  @HttpCode(200)
  async resolve(@CurrentUser() u: JwtUser, @Param("alertId") alertId: string) {
    if (!isHomeVisitManager(u)) throw new ForbiddenException("Managers only");
    return this.safety.resolve(requireTenantId(u), alertId);
  }

  @Get(":id")
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.homeVisits.get(requireTenantId(u), u, id);
  }

  // ---- dispatch (KNAG / clinic.home_dispatch) ----
  @Get(":id/suggestions")
  suggestions(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.homeVisits.suggest(requireTenantId(u), u, id);
  }

  @Post(":id/assign")
  @HttpCode(200)
  assign(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { clinicianId: string }) {
    return this.homeVisits.assign(requireTenantId(u), u, id, body.clinicianId);
  }

  // ---- execution (HVEXE) and safety (HVSAF): never flag-gated ----
  @Post(":id/depart")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  depart(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { lat?: number; lng?: number; etaMinutes?: number }) {
    return this.exec.depart(requireTenantId(u), u, id, body ?? {});
  }

  @Post(":id/arrive")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  arrive(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { lat: number; lng: number }) {
    return this.exec.arrive(requireTenantId(u), u, id, body ?? ({} as never));
  }

  @Post(":id/finish")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  finish(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { lat?: number; lng?: number }) {
    return this.exec.finish(requireTenantId(u), u, id, body ?? {});
  }

  @Post(":id/abort-unsafe")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  abort(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { reason: string; reasonCategory?: string; lat?: number; lng?: number }) {
    return this.exec.abortUnsafe(requireTenantId(u), u, id, body ?? ({} as never));
  }

  @Post(":id/sos")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  sos(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { lat: number; lng: number }) {
    return this.exec.sos(requireTenantId(u), u, id, body ?? ({} as never));
  }

  @Post(":id/safety/answer")
  @HttpCode(200)
  @RequiresScope("home_visits.perform")
  answer(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.exec.answerSafetyPrompt(requireTenantId(u), u, id);
  }
}
