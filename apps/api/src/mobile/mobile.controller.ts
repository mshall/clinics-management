import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { MobileAlertsService } from "./mobile-alerts.service";
import { MobileUpgradeService } from "./mobile-upgrade.service";
import { MobileService } from "./mobile.service";
import { MobileInboxQueryDto, MobileAckBodyDto, MobileUpgradeRequestBodyDto, MobileScheduleQueryDto, MobileApproveBodyDto, MobileRegisterDeviceBodyDto, MobilePushTokenBodyDto, MobileRecordVitalsBodyDto } from "./mobile.controller.dto";

/**
 * Kiorly staff app API. All routes need a staff JWT. Routes other than bootstrap / alerts / DELETE devices need the `mobile_staff_app`
 * entitlement (MobileInterceptor); the alert inbox is a safety control and works on every plan (ADR-025).
 */
@ApiTags("mobile")
@ApiBearerAuth("bearer")
@Controller("mobile")
@UseGuards(JwtAuthGuard)
export class MobileController {
  constructor(private readonly svc: MobileService, private readonly alerts: MobileAlertsService, private readonly upgrade: MobileUpgradeService) {}

  @Get("bootstrap") bootstrap(@CurrentUser() u: JwtUser, @Headers("x-kiorly-device") dev?: string) { return this.svc.bootstrap(u, dev); }

  @Post("devices") register(@CurrentUser() u: JwtUser, @Body() b: MobileRegisterDeviceBodyDto) {
    return this.svc.registerDevice(u, { deviceId: b.deviceId, platform: b.platform, name: b.name, appVersion: typeof b.appVersion === "string" ? b.appVersion.slice(0, 40) : undefined, pushToken: typeof b.pushToken === "string" ? b.pushToken.slice(0, 300) : undefined });
  }
  @Get("devices") devices(@CurrentUser() u: JwtUser) { return this.svc.listDevices(u); }
  @Delete("devices/:id") revoke(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.revokeDevice(u, id); }
  @Put("devices/:id/push-token") pushToken(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: MobilePushTokenBodyDto) {
    return this.svc.setPushToken(u, id, { token: b.token, provider: b.provider });
  }

  @Get("inbox") inbox(@CurrentUser() u: JwtUser, @Query() q: MobileInboxQueryDto) { return this.svc.inbox(u, q); }
  @Post("inbox/read-all") @HttpCode(200) readAll(@CurrentUser() u: JwtUser) { return this.svc.markAllRead(u); }
  @Post("inbox/:id/read") @HttpCode(200) read(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.markRead(u, id); }
  @Post("push/test") @HttpCode(200) pushTest(@CurrentUser() u: JwtUser) { return this.svc.pushTest(u); }

  @Get("alerts") listAlerts(@CurrentUser() u: JwtUser, @Query("status") status?: string) { requireTenantId(u); return this.alerts.list(u, status === "all" ? "all" : "open"); }
  @Post("alerts/:id/ack") @HttpCode(200) ack(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: MobileAckBodyDto) { return this.alerts.ack(u, id, typeof b?.note === "string" ? b.note : undefined); }

  /** Exempt from FEATURE_DISABLED (a Basic org must be able to ask). Idempotent: a repeat for the same feature within 24h returns the original. */
  @Post("upgrade-request") @HttpCode(200) upgradeRequest(@CurrentUser() u: JwtUser, @Body() b: MobileUpgradeRequestBodyDto) { return this.upgrade.request(u, b ?? {}); }

  @Get("summary") summary(@CurrentUser() u: JwtUser) { return this.svc.summary(u); }
  @Get("schedule") schedule(@CurrentUser() u: JwtUser, @Query() q: MobileScheduleQueryDto) { return this.svc.schedule(u, q); }
  @Get("search") search(@CurrentUser() u: JwtUser, @Query("q") q?: string) { return this.svc.search(u, q ?? ""); }
  @Get("prescriptions") prescriptions(@CurrentUser() u: JwtUser, @Query("status") s?: string) { return this.svc.prescriptions(u, s === "signed" ? "signed" : "pending"); }
  @Post("prescriptions/:encounterId/sign") @HttpCode(200) sign(@CurrentUser() u: JwtUser, @Param("encounterId") id: string) { return this.svc.signPrescription(u, id); }
  @Get("lab-results") labResults(@CurrentUser() u: JwtUser, @Query("status") s?: string) { return this.svc.labResults(u, s === "reviewed" ? "reviewed" : "pending"); }
  @Post("lab-results/:orderId/approve") @HttpCode(200) approve(@CurrentUser() u: JwtUser, @Param("orderId") id: string, @Body() b: MobileApproveBodyDto) { return this.svc.approveLabResult(u, id, typeof b?.note === "string" ? b.note : undefined); }
  @Post("vitals") recordVitals(@CurrentUser() u: JwtUser, @Body() b: MobileRecordVitalsBodyDto, @Headers("idempotency-key") idem?: string) { return this.svc.recordVitals(u, b, idem); }
  @Get("revenue/snapshot") revenue(@CurrentUser() u: JwtUser) { return this.svc.revenueSnapshot(u); }
}
