import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ClinicAiService } from "./clinic-ai.service";

@ApiTags("clinic-ai")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@Controller("clinic-ai")
export class ClinicAiController {
  constructor(private readonly clinicAi: ClinicAiService) {}

  @RequiresEntitlement("ai_assistant")
  @Get("patients/:patientId/pre-visit-summary")
  preVisit(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.clinicAi.preVisitSummary(requireTenantId(user), patientId);
  }

  @RequiresEntitlement("mod_front_desk")
  @Post("appointments/refresh-no-show-risk")
  refreshRisk(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.clinicAi.refreshAppointmentNoShowRisks(requireTenantId(user), clinicId);
  }

  @RequiresEntitlement("ai_scribe")
  @Post("encounters/:encounterId/scribe/start")
  startScribe(
    @CurrentUser() user: JwtUser,
    @Param("encounterId") encounterId: string,
    @Body() body: { patientConsent?: boolean; retainAudioAfterSignOff?: boolean },
  ) {
    return this.clinicAi.startScribeSession(requireTenantId(user), encounterId, {
      patientConsent: Boolean(body?.patientConsent),
      retainAudioAfterSignOff: Boolean(body?.retainAudioAfterSignOff),
    });
  }

  @RequiresEntitlement("ai_scribe")
  @Get("scribe/:sessionId")
  getScribe(@CurrentUser() user: JwtUser, @Param("sessionId") sessionId: string) {
    return this.clinicAi.getScribeSession(requireTenantId(user), sessionId);
  }

  @RequiresEntitlement("ai_scribe")
  @Post("scribe/:sessionId/audio")
  uploadAudio(
    @CurrentUser() user: JwtUser,
    @Param("sessionId") sessionId: string,
    @Body() body: { seq: number; mimeType?: string; payloadB64: string },
  ) {
    return this.clinicAi.uploadAudioChunk(requireTenantId(user), sessionId, body);
  }

  @RequiresEntitlement("ai_scribe")
  @Post("scribe/:sessionId/stop")
  stopScribe(
    @CurrentUser() user: JwtUser,
    @Param("sessionId") sessionId: string,
    @Body() body?: { audioSeconds?: number },
  ) {
    return this.clinicAi.stopScribeSession(requireTenantId(user), sessionId, body);
  }

  @RequiresEntitlement("ai_scribe")
  @Post("scribe/:sessionId/approve")
  approveScribe(
    @CurrentUser() user: JwtUser,
    @Param("sessionId") sessionId: string,
    @Body() body: Record<string, string>,
  ) {
    return this.clinicAi.approveScribeDraft(requireTenantId(user), sessionId, body);
  }
}
