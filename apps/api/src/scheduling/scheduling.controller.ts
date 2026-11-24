import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SchedulingService } from "./scheduling.service";
import { SlotService } from "./slot.service";
import { SLOT_CHANNEL } from "./slot-channel";
import { SchedulingPutTypeOverridesBodyDto } from "./scheduling.controller.dto";
import { SchedulingAddWaitlistBodyDto, SchedulingPatchTypeBodyDto, SchedulingPutAvailabilityBodyDto, SchedulingSaveTypeBodyDto, SchedulingSeriesBodyDto } from "./scheduling.free-form.dto";

@ApiTags("scheduling")
@ApiBearerAuth("bearer")
@Controller("scheduling")
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly slots: SlotService,
  ) {}

  @Get("appointment-types")
  listTypes(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.scheduling.listAppointmentTypes(requireTenantId(user), clinicId);
  }

  @Post("appointment-types")
  saveType(@CurrentUser() user: JwtUser, @Body() body: SchedulingSaveTypeBodyDto) {
    return this.scheduling.upsertAppointmentType(requireTenantId(user), body as unknown as Record<string, unknown>);
  }

  @Patch("appointment-types/:id")
  patchType(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: SchedulingPatchTypeBodyDto) {
    return this.scheduling.patchAppointmentType(requireTenantId(user), id, body as unknown as Record<string, unknown>);
  }

  @Get("clinicians/:clinicianId/type-overrides")
  listTypeOverrides(@CurrentUser() user: JwtUser, @Param("clinicianId") clinicianId: string) {
    return this.scheduling.listClinicianTypeOverrides(requireTenantId(user), clinicianId);
  }

  @Put("clinicians/:clinicianId/type-overrides")
  putTypeOverrides(
    @CurrentUser() user: JwtUser,
    @Param("clinicianId") clinicianId: string,
    @Body() body: SchedulingPutTypeOverridesBodyDto,
  ) {
    return this.scheduling.putClinicianTypeOverrides(requireTenantId(user), clinicianId, body.overrides ?? []);
  }

  @Get("slots")
  listSlots(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
    @Query("typeId") typeId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("channel") channel?: string,
  ) {
    const ch = channel === SLOT_CHANNEL.MARKETPLACE ? SLOT_CHANNEL.MARKETPLACE : SLOT_CHANNEL.INTERNAL;
    return this.slots.getSlots({
      tenantId: requireTenantId(user),
      clinicId,
      clinicianId,
      typeId,
      from: new Date(from),
      to: new Date(to),
      channel: ch,
    });
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
  putAvail(@CurrentUser() user: JwtUser, @Body() body: SchedulingPutAvailabilityBodyDto) {
    return this.scheduling.upsertAvailability(requireTenantId(user), body);
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

  @Get("waitlist/offers")
  waitlistOffers(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    return this.scheduling.listWaitlistOffers(requireTenantId(user), clinicId);
  }

  @Post("waitlist/:id/cancel")
  cancelWaitlist(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.scheduling.cancelWaitlistEntry(requireTenantId(user), id);
  }

  @Post("waitlist")
  addWaitlist(@CurrentUser() user: JwtUser, @Body() body: SchedulingAddWaitlistBodyDto) {
    return this.scheduling.createWaitlist(requireTenantId(user), body);
  }

  @Post("series")
  series(@CurrentUser() user: JwtUser, @Body() body: SchedulingSeriesBodyDto) {
    return this.scheduling.createSeries(requireTenantId(user), body);
  }

  @Post("appointments/:id/no-show")
  noShow(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.scheduling.markNoShow(requireTenantId(user), id);
  }
}
