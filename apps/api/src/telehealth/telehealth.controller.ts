import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { consumeRateLimit } from "../common/rate-limit";
import { SubscriptionAccessGuard } from "../subscriptions/subscription-access.guard";
import { RequiresSubscriptionAccess } from "../subscriptions/requires-subscription-access.decorator";
import { SubscriptionAccessAction } from "../subscriptions/subscription-access-policy";
import { TelehealthException } from "./telehealth.errors";
import { TelehealthService } from "./telehealth.service";

/**
 * Staff telehealth API (clinicians use normal auth). New capability (creating sessions, enabling a doctor) is gated by flag
 * `telehealth.video` + entitlement `telehealth_video` INSIDE the service; reads, join, signaling and end are never gated so
 * already-scheduled visits keep working when the flag is switched OFF (OFF never hides data).
 */
@ApiTags("telehealth")
@ApiBearerAuth("bearer")
@Controller("telehealth")
@UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
export class TelehealthController {
  constructor(private readonly svc: TelehealthService) {}

  private limit(u: JwtUser, id: string, kind: string, max: number): void {
    const r = consumeRateLimit(`th:${kind}:${u.userId}:${id}`, max, 60_000);
    if (!r.ok) throw new TelehealthException("TELEHEALTH_RATE_LIMITED", { retryAfterSec: r.retryAfterSec });
  }

  @Post("appointments/:appointmentId/session")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.SCHEDULING_WRITE)
  @ApiOperation({ summary: "Create (idempotent) the telehealth session of a VIDEO appointment" })
  create(@CurrentUser() u: JwtUser, @Param("appointmentId") appointmentId: string) {
    requireTenantId(u);
    return this.svc.createForAppointment(u, appointmentId);
  }

  @Get("appointments/:appointmentId/session")
  byAppointment(@CurrentUser() u: JwtUser, @Param("appointmentId") appointmentId: string) {
    requireTenantId(u);
    return this.svc.getByAppointmentForStaff(u, appointmentId);
  }

  @Get("settings/:clinicianId")
  settings(@CurrentUser() u: JwtUser, @Param("clinicianId") clinicianId: string) {
    return this.svc.getSettings(u, clinicianId);
  }

  @Put("settings/:clinicianId")
  putSettings(@CurrentUser() u: JwtUser, @Param("clinicianId") clinicianId: string, @Body() body: { offersTelehealth?: boolean; windows?: unknown }) {
    return this.svc.putSettings(u, clinicianId, body ?? {});
  }

  @Get("review")
  review(@CurrentUser() u: JwtUser) {
    return this.svc.listNeedingReview(u);
  }

  @Get("sessions/:id")
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.getForStaff(u, id);
  }

  @Post("sessions/:id/join")
  @HttpCode(200)
  join(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    this.limit(u, id, "join", 30);
    return this.svc.joinAsClinician(u, id);
  }

  @Post("sessions/:id/signals")
  @HttpCode(200)
  postSignal(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { type?: string; payload?: unknown }) {
    this.limit(u, id, "sigpost", 300);
    return this.svc.postSignal({ actor: u, sessionId: id }, body ?? {});
  }

  @Get("sessions/:id/signals")
  getSignals(@CurrentUser() u: JwtUser, @Param("id") id: string, @Query("afterSeq") afterSeq?: string) {
    this.limit(u, id, "sigget", 120);
    return this.svc.pollSignals({ actor: u, sessionId: id }, Number(afterSeq) || 0);
  }

  @Post("sessions/:id/mode")
  @HttpCode(200)
  mode(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: { mode?: string }) {
    return this.svc.setMode({ actor: u, sessionId: id }, String(body?.mode ?? ""));
  }

  @Post("sessions/:id/end")
  @HttpCode(200)
  end(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.end({ actor: u, sessionId: id });
  }

  @Post("sessions/:id/regenerate-link")
  @HttpCode(200)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.SCHEDULING_WRITE)
  regenerate(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.regenerateLink(u, id);
  }
}
