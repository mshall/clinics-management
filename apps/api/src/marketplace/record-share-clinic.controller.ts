import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { RecordShareService } from "./record-share.service";
import { RecordShareClinicPutRecordShareConsentBodyDto } from "./record-share-clinic.controller.dto";

/** KX-11 — clinic UI toggles (kept out of PatientsModule to avoid Nest import cycles). */
@ApiTags("patients")
@ApiBearerAuth("bearer")
@Controller("patients")
@UseGuards(JwtAuthGuard, FeatureGuard)
export class RecordShareClinicController {
  constructor(private readonly recordShare: RecordShareService) {}

  @Get(":id/record-share-consent")
  @ApiOperation({ summary: "KX-11 — record-share consent scopes for the patient app" })
  getRecordShareConsent(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.recordShare.listForPatient(requireTenantId(user), id);
  }

  @RequiresFeature("clinic.record_share_patient_app")
  @Put(":id/record-share-consent")
  @ApiOperation({ summary: "KX-11 — update record-share consent scopes" })
  putRecordShareConsent(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: RecordShareClinicPutRecordShareConsentBodyDto,
  ) {
    return this.recordShare.upsertConsents(requireTenantId(user), id, body?.consents ?? [], "CLINIC");
  }
}
