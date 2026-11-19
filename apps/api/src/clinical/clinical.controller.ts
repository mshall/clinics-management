import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  ClinicalLetterType,
  ClinicalOrderKind,
  ClinicalOrderStatus,
  ClinicalShortcutType,
  ClinicalSpecialty,
} from "@prisma/client";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { ClinicalOrdersService } from "./clinical-orders.service";
import { SpecialtyPacksService } from "./specialty-packs.service";

@ApiTags("clinical")
@ApiBearerAuth("bearer")
@Controller("clinical")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_clinical")
export class ClinicalController {
  constructor(
    private readonly clinical: ClinicalService,
    private readonly safety: ClinicalSafetyService,
    private readonly rxSafety: RxSafetyCheckService,
    private readonly drugCatalog: DrugCatalogService,
    private readonly orders: ClinicalOrdersService,
    private readonly packs: SpecialtyPacksService,
  ) {}

  @Get("form-templates")
  listTemplates(
    @CurrentUser() user: JwtUser,
    @Query("specialty") specialty?: ClinicalSpecialty,
    @Query("clinicId") clinicId?: string,
  ) {
    return this.clinical.listTemplates(requireTenantId(user), user, specialty, clinicId);
  }

  @Post("form-templates")
  upsertTemplate(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.clinical.upsertTemplate(requireTenantId(user), user, body as never);
  }

  @Delete("form-templates/:id")
  deleteTemplate(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.clinical.deleteClinicTemplate(requireTenantId(user), user, id);
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

  @Get("drugs/search")
  searchDrugs(
    @CurrentUser() user: JwtUser,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    const tenantId = requireTenantId(user);
    const lim = limit ? Number(limit) : 20;
    return this.drugCatalog.searchProducts(tenantId, user, q ?? "", Number.isFinite(lim) ? lim : 20);
  }

  @Post("rx/check")
  rxCheck(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      patientId: string;
      items: { drugName: string; drugProductId?: string | null }[];
    },
  ) {
    return this.rxSafety.checkRx(requireTenantId(user), body.patientId, body.items ?? []);
  }

  @Post("medications/safety-check")
  safetyCheck(
    @CurrentUser() user: JwtUser,
    @Body() body: {
      patientId: string;
      drugName: string;
      drugProductId?: string;
      existingDrugNames?: string[];
    },
  ) {
    return this.safety.checkMedicationSafety(
      requireTenantId(user),
      body.patientId,
      body.drugName,
      body.existingDrugNames ?? [],
      { drugProductId: body.drugProductId },
    );
  }

  /** CL-06 — lab & imaging orders. */
  @Get("orders")
  listOrders(
    @CurrentUser() user: JwtUser,
    @Query("encounterId") encounterId?: string,
    @Query("patientId") patientId?: string,
  ) {
    return this.orders.list(requireTenantId(user), { encounterId, patientId });
  }

  @Post("orders")
  createOrder(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      clinicId: string;
      patientId: string;
      encounterId?: string;
      kind: ClinicalOrderKind;
      notes?: string;
      items: { code?: string; nameEn: string; nameAr?: string }[];
    },
  ) {
    return this.orders.create(requireTenantId(user), user.userId, body);
  }

  @Patch("orders/:id")
  patchOrder(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body()
    body: {
      status?: ClinicalOrderStatus;
      resultsJson?: unknown;
      notes?: string;
      items?: { id?: string; resultValue?: string; resultUnit?: string; resultFlag?: string }[];
    },
  ) {
    return this.orders.patch(requireTenantId(user), id, body);
  }

  /** CL-07 specialty packs */
  @Get("specialty-packs/addons")
  listSpecialtyAddons() {
    return this.packs.listAddons();
  }

  @Get("patients/:patientId/dental-chart")
  @RequiresEntitlement("pack_dental")
  dentalChart(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.packs.getDentalChart(requireTenantId(user), patientId);
  }

  @Put("patients/:patientId/dental-chart")
  @RequiresEntitlement("pack_dental")
  upsertDentalTooth(
    @CurrentUser() user: JwtUser,
    @Param("patientId") patientId: string,
    @Body() body: { toothFdi: number; status?: string; planNote?: string; feeAmount?: number },
  ) {
    return this.packs.upsertDentalTooth(requireTenantId(user), patientId, body);
  }

  @Get("patients/:patientId/before-after")
  @RequiresEntitlement("pack_aesthetics")
  beforeAfter(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.packs.listBeforeAfterPairs(requireTenantId(user), patientId);
  }

  @Post("physio-plans")
  @RequiresEntitlement("pack_physio")
  physioPlan(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      clinicId: string;
      patientId: string;
      clinicianId: string;
      label: string;
      sessionCount: number;
      notes?: string;
    },
  ) {
    return this.packs.createPhysioPlan(requireTenantId(user), body);
  }
}
