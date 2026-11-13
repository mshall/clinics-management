import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ClinicAiService } from "./clinic-ai.service";

@ApiTags("clinic-ai")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("clinic-ai")
export class ClinicAiController {
  constructor(private readonly clinicAi: ClinicAiService) {}

  @Get("patients/:patientId/pre-visit-summary")
  preVisit(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.clinicAi.preVisitSummary(requireTenantId(user), patientId);
  }

  @Post("appointments/refresh-no-show-risk")
  refreshRisk(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.clinicAi.refreshAppointmentNoShowRisks(requireTenantId(user), clinicId);
  }

  @Post("encounters/:encounterId/scribe/start")
  startScribe(@CurrentUser() user: JwtUser, @Param("encounterId") encounterId: string) {
    return this.clinicAi.startScribeSession(requireTenantId(user), encounterId);
  }

  @Post("scribe/:sessionId/approve")
  approveScribe(@CurrentUser() user: JwtUser, @Param("sessionId") sessionId: string, @Body() body: Record<string, string>) {
    return this.clinicAi.approveScribeDraft(requireTenantId(user), sessionId, body);
  }
}
