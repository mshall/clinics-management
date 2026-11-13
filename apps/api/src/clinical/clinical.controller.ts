import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ClinicalLetterType, ClinicalShortcutType, ClinicalSpecialty } from "@prisma/client";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";

@ApiTags("clinical")
@ApiBearerAuth("bearer")
@Controller("clinical")
@UseGuards(JwtAuthGuard)
export class ClinicalController {
  constructor(
    private readonly clinical: ClinicalService,
    private readonly safety: ClinicalSafetyService,
  ) {}

  @Get("form-templates")
  listTemplates(@CurrentUser() user: JwtUser, @Query("specialty") specialty?: ClinicalSpecialty) {
    return this.clinical.listTemplates(requireTenantId(user), user, specialty);
  }

  @Post("form-templates")
  upsertTemplate(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.clinical.upsertTemplate(requireTenantId(user), user, body as never);
  }

  @Get("shortcuts")
  shortcuts(@CurrentUser() user: JwtUser) {
    return this.clinical.listShortcuts(requireTenantId(user), user);
  }

  @Post("shortcuts")
  createShortcut(@CurrentUser() user: JwtUser, @Body() body: { type: ClinicalShortcutType; label: string; trigger?: string; payload: unknown }) {
    return this.clinical.saveShortcut(requireTenantId(user), user, body);
  }

  @Delete("shortcuts/:id")
  deleteShortcut(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.clinical.deleteShortcut(requireTenantId(user), user, id);
  }

  @Get("icd10/search")
  searchIcd(@CurrentUser() user: JwtUser, @Query("q") q?: string) {
    return this.clinical.searchIcd10(requireTenantId(user), user, q ?? "");
  }

  @Post("icd10/favorites")
  favIcd(@CurrentUser() user: JwtUser, @Body() body: { icd10Code: string }) {
    return this.clinical.addDiagnosisFavorite(requireTenantId(user), user, body.icd10Code);
  }

  @Get("patients/:patientId/vitals-series")
  vitalsSeries(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.clinical.patientVitalsSeries(requireTenantId(user), user, patientId);
  }

  @Get("patients/:patientId/last-visit")
  lastVisit(
    @CurrentUser() user: JwtUser,
    @Param("patientId") patientId: string,
    @Query("excludeEncounterId") excludeEncounterId?: string,
  ) {
    return this.clinical.lastVisitSnapshot(requireTenantId(user), user, patientId, excludeEncounterId);
  }

  @Post("letters")
  letter(@CurrentUser() user: JwtUser, @Body() body: { type: ClinicalLetterType; patientId: string; encounterId?: string; fields?: Record<string, string> }) {
    return this.clinical.generateLetter(requireTenantId(user), user, body);
  }

  @Post("medications/safety-check")
  safetyCheck(
    @CurrentUser() user: JwtUser,
    @Body() body: { patientId: string; drugName: string; existingDrugNames?: string[] },
  ) {
    return this.safety.checkMedicationSafety(
      requireTenantId(user),
      body.patientId,
      body.drugName,
      body.existingDrugNames ?? [],
    );
  }
}
