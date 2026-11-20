import { BadRequestException, Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { AgencyService } from "./agency.service";

/** KNAG01-04 — agency roster, pay and cash. Dispatch itself is `POST /home-visits/:id/assign` (guarded: only VERIFIED nurses are assignable). */
@ApiTags("nurse")
@ApiBearerAuth("bearer")
@Controller("nurse/agency")
@UseGuards(JwtAuthGuard)
export class NurseAgencyController {
  constructor(private readonly agency: AgencyService) {}

  @Get("roster")
  roster(@CurrentUser() u: JwtUser) {
    return this.agency.roster(requireTenantId(u), u);
  }

  @Put("roster/:userId")
  upsert(@CurrentUser() u: JwtUser, @Param("userId") userId: string, @Body() b: Parameters<AgencyService["upsertRoster"]>[3]) {
    return this.agency.upsertRoster(requireTenantId(u), u, userId, b ?? {});
  }

  @Get("pay/:nurseId")
  pay(@CurrentUser() u: JwtUser, @Param("nurseId") nurseId: string, @Query("from") from: string, @Query("to") to: string) {
    const f = new Date(from);
    const t = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t <= f) throw new BadRequestException("Invalid from/to");
    return this.agency.payStatement(requireTenantId(u), u, nurseId, f, t);
  }
}
