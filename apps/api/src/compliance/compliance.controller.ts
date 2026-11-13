import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ComplianceService } from "./compliance.service";

@ApiTags("compliance")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post("patients/:patientId/data-protection-consent")
  recordConsent(
    @CurrentUser() user: JwtUser,
    @Param("patientId") patientId: string,
    @Body() body: { signerName?: string; signedOnTablet?: boolean; locale?: string; ipAddress?: string },
  ) {
    return this.compliance.recordDataProtectionConsent(requireTenantId(user), patientId, body);
  }

  @Get("patients/:patientId/data-protection-consent")
  latestConsent(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.compliance.latestConsent(requireTenantId(user), patientId);
  }

  @Get("egypt/eta-queue")
  etaQueue(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.compliance.listEtaQueue(requireTenantId(user), clinicId);
  }

  @Post("egypt/eta-queue/:id/submit")
  submitEta(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { etaUuid: string }) {
    return this.compliance.markEtaSubmitted(requireTenantId(user), id, body.etaUuid);
  }
}
