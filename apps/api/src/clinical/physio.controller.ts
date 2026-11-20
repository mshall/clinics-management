import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { PhysioService } from "./physio.service";

/** CL07-PT01..05. Add-on `pack_physio`; writes need the physio template scope (physiotherapists). */
@ApiTags("physio")
@ApiBearerAuth("bearer")
@Controller("clinical/physio")
@UseGuards(JwtAuthGuard, EntitlementGuard, ScopeGuard)
@RequiresEntitlement("pack_physio")
export class PhysioController {
  constructor(private readonly physio: PhysioService) {}

  @Post("referrals")
  @RequiresScope("encounter.template.physio")
  referral(@CurrentUser() u: JwtUser, @Body() b: Parameters<PhysioService["createReferral"]>[2]) {
    return this.physio.createReferral(requireTenantId(u), u, b);
  }

  @Post("assessments")
  @RequiresScope("encounter.template.physio")
  assessment(@CurrentUser() u: JwtUser, @Body() b: Parameters<PhysioService["createAssessment"]>[2]) {
    return this.physio.createAssessment(requireTenantId(u), u, b);
  }

  @Post("plans")
  @RequiresScope("encounter.template.physio")
  plan(@CurrentUser() u: JwtUser, @Body() b: Parameters<PhysioService["createPlan"]>[2]) {
    return this.physio.createPlan(requireTenantId(u), u, b);
  }

  @Get("plans/:id")
  getPlan(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.physio.getPlan(requireTenantId(u), id);
  }

  @Post("plans/:id/progress-notes")
  @RequiresScope("sessions.record")
  note(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: Parameters<PhysioService["addProgressNote"]>[3]) {
    return this.physio.addProgressNote(requireTenantId(u), u, id, b);
  }

  @Post("plans/:id/discharge")
  @RequiresScope("encounter.template.physio")
  discharge(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { summary: string }) {
    return this.physio.discharge(requireTenantId(u), u, id, b.summary);
  }

  @Put("plans/:id/home-programme")
  @RequiresScope("encounter.template.physio")
  programme(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { exercises: Parameters<PhysioService["setHomeProgramme"]>[2] }) {
    return this.physio.setHomeProgramme(requireTenantId(u), id, b.exercises);
  }

  @Post("plans/:id/home-programme/share")
  @RequiresScope("encounter.template.physio")
  share(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.physio.shareHomeProgramme(requireTenantId(u), u, id);
  }

  @Get("patients/:patientId/outcome-trend")
  trend(@CurrentUser() u: JwtUser, @Param("patientId") patientId: string, @Query("kind") kind: string, @Query("label") label: string) {
    return this.physio.trend(requireTenantId(u), patientId, kind, label);
  }
}

@ApiTags("public")
@Controller("public/physio/hep")
export class PhysioPublicController {
  constructor(private readonly physio: PhysioService) {}

  @Get(":token")
  get(@Param("token") token: string) {
    return this.physio.publicHomeProgramme(token);
  }
}
