import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ComplianceService } from "./compliance.service";
import { PatchClinicEtaSettingsDto } from "../clinics/dto/patch-clinic-eta-settings.dto";
import { ResubmitFiscalSubmissionDto } from "./dto/resubmit-fiscal-submission.dto";

const FISCAL_GOVERNANCE_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
]);

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
  submitEta(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    if (user.role && !FISCAL_GOVERNANCE_ROLES.has(user.role)) {
      throw new ForbiddenException("Insufficient permissions for fiscal submit");
    }
    return this.compliance.submitEtaToAuthority(requireTenantId(user), id);
  }

  @Post("egypt/eta-queue/:id/resubmit")
  resubmitEta(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: ResubmitFiscalSubmissionDto) {
    if (user.role && !FISCAL_GOVERNANCE_ROLES.has(user.role)) {
      throw new ForbiddenException("Insufficient permissions for fiscal resubmit");
    }
    return this.compliance.resubmitRejectedFiscal(requireTenantId(user), id, body);
  }

  @Get("egypt/eta-queue/:id/receipt")
  etaReceiptView(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.compliance.getEtaReceiptView(requireTenantId(user), id);
  }

  @Patch("clinics/:clinicId/eta-settings")
  patchClinicEta(@CurrentUser() user: JwtUser, @Param("clinicId") clinicId: string, @Body() body: PatchClinicEtaSettingsDto) {
    return this.compliance.patchClinicEtaSettings(requireTenantId(user), clinicId, body);
  }
}
