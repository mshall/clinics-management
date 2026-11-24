import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ComplianceService } from "./compliance.service";
import { ComplianceRecordConsentBodyDto } from "./compliance.controller.dto";

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
    @Body() body: ComplianceRecordConsentBodyDto,
  ) {
    return this.compliance.recordDataProtectionConsent(requireTenantId(user), patientId, body);
  }

  @Get("patients/:patientId/data-protection-consent")
  latestConsent(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.compliance.latestConsent(requireTenantId(user), patientId);
  }
}