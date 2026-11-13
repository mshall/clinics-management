import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SchedulingService } from "./scheduling.service";

@ApiTags("scheduling")
@ApiBearerAuth("bearer")
@Controller("scheduling")
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get("appointment-types")
  listTypes(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.scheduling.listAppointmentTypes(requireTenantId(user), clinicId);
  }

  @Post("appointment-types")
  saveType(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.scheduling.upsertAppointmentType(requireTenantId(user), body);
  }

  @Get("availability")
  getAvail(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
  ) {
    return this.scheduling.getAvailability(requireTenantId(user), clinicId, clinicianId);
  }

  @Put("availability")
  putAvail(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.scheduling.upsertAvailability(requireTenantId(user), body as never);
  }

  @Get("clinicians/:clinicianId/leave-blocks")
  leaveBlocks(
    @CurrentUser() user: JwtUser,
    @Param("clinicianId") clinicianId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.scheduling.clinicianLeaveBlocks(
      requireTenantId(user),
      clinicianId,
      new Date(from),
      new Date(to),
    );
  }

  @Get("waitlist")
  waitlist(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.scheduling.listWaitlist(requireTenantId(user), clinicId);
  }

  @Post("waitlist")
  addWaitlist(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.scheduling.createWaitlist(requireTenantId(user), body as never);
  }

  @Post("series")
  series(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    return this.scheduling.createSeries(requireTenantId(user), body as never);
  }

  @Post("appointments/:id/no-show")
  noShow(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.scheduling.markNoShow(requireTenantId(user), id);
  }
}
