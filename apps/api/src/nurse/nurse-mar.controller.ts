import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { DoctorOrderService } from "./doctor-order.service";
import { MedicationAdministrationService, type AdministrationInput } from "./medication-administration.service";
import type { OrderLine } from "./mar-safety";

/**
 * KNMAR01-03. `nurse.mar` (launch-locked, GKN1) decides whether the STRUCTURED MAR screens/endpoints exist (OFF: medication is free text in the
 * visit record). The safety checks themselves (doctor order, expiry, allergy, duplicate, controlled witness) live in the service and are not flags.
 */
@ApiTags("nurse")
@ApiBearerAuth("bearer")
@Controller("nurse/mar")
@UseGuards(JwtAuthGuard, ScopeGuard, FeatureGuard)
@RequiresFeature("nurse.mar")
export class NurseMarController {
  constructor(
    private readonly orders: DoctorOrderService,
    private readonly mar: MedicationAdministrationService,
  ) {}

  @Post("orders/photo")
  @RequiresScope("mar.administer")
  photoOrder(@CurrentUser() u: JwtUser, @Body() b: { patientId: string; prescriberName: string; orderedOn: string; expiresOn: string; controlled?: boolean; lines: OrderLine[]; documentKey?: string }) {
    return this.orders.createFromPhoto(requireTenantId(u), u, b);
  }

  @Post("orders/shared")
  @HttpCode(200)
  @RequiresScope("mar.administer")
  sharedOrder(@CurrentUser() u: JwtUser, @Body() b: Parameters<DoctorOrderService["ingestShared"]>[1]) {
    return this.orders.ingestShared(requireTenantId(u), b);
  }

  @Post("orders/:id/revoke")
  @HttpCode(200)
  @RequiresScope("mar.administer")
  revoke(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.orders.revoke(requireTenantId(u), u, id);
  }

  @Get("patients/:patientId/orders")
  orderList(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string) {
    return this.orders.listForPatient(requireTenantId(u), patientId);
  }

  @Post("administrations")
  @RequiresScope("mar.administer")
  administer(@CurrentUser() u: JwtUser, @Body() b: AdministrationInput) {
    return this.mar.administer(requireTenantId(u), u, b);
  }

  @Get("patients/:patientId/administrations")
  list(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string) {
    return this.mar.listForPatient(requireTenantId(u), patientId);
  }
}
