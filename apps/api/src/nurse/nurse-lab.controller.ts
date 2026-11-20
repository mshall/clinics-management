import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { LabSampleService, type CreateNurseLabOrderInput, type RecordCollectionInput } from "./lab-sample.service";

/**
 * KNLAB01 / KLORD05 — sample collection against a lab order, handed to Kiorly Lab via Kiorex. The edition (NURSE), the plan (`nurse_lab_samples`,
 * Pro+) and `clinic.lab_order_handoff` are enforced in the service (new action only: reads keep working when the flag is OFF). The collection
 * safety checks are never flagged. Scope: the nurse's own documentation scope (`encounter.template.nursing`).
 */
@ApiTags("nurse")
@ApiBearerAuth("bearer")
@Controller("nurse")
@UseGuards(JwtAuthGuard, ScopeGuard)
export class NurseLabController {
  constructor(private readonly samples: LabSampleService) {}

  /** The nurse's lab orders: of one visit (`appointmentId`), of one patient, or her own. */
  @Get("lab-orders")
  @RequiresScope("encounter.template.nursing")
  list(@CurrentUser() user: JwtUser, @Query("appointmentId") appointmentId?: string, @Query("patientId") patientId?: string) {
    return this.samples.listForVisit(requireTenantId(user), user, { appointmentId, patientId });
  }

  /** Transcribe a doctor's lab request for a visit (doctor + date + confirmation required; every test needs its lab catalogue code). */
  @Post("visits/:appointmentId/lab-orders")
  @RequiresScope("encounter.template.nursing")
  create(@CurrentUser() user: JwtUser, @Param("appointmentId") appointmentId: string, @Body() body: CreateNurseLabOrderInput) {
    return this.samples.createOrder(requireTenantId(user), user, appointmentId, body);
  }

  @Get("lab-orders/:orderId")
  @RequiresScope("encounter.template.nursing")
  get(@CurrentUser() user: JwtUser, @Param("orderId") orderId: string) {
    return this.samples.get(requireTenantId(user), orderId);
  }

  /** Record tubes, times, temperature and >= 2 verified identifiers, then hand the sample to the lab (emits `LabOrderPlaced`). Idempotent per order. */
  @Post("lab-orders/:orderId/collection")
  @RequiresScope("encounter.template.nursing")
  collect(@CurrentUser() user: JwtUser, @Param("orderId") orderId: string, @Body() body: RecordCollectionInput) {
    return this.samples.recordCollection(requireTenantId(user), user, orderId, body);
  }

  /** Lab status + chain of custody as relayed by Kiorex (no names, no PHI, no results). */
  @Get("lab-orders/:orderId/custody")
  @RequiresScope("encounter.template.nursing")
  custody(@CurrentUser() user: JwtUser, @Param("orderId") orderId: string) {
    return this.samples.custody(requireTenantId(user), orderId);
  }
}
