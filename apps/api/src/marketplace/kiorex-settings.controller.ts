import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicBookingPageService, type PutBookingSlugBody } from "./clinic-booking-page.service";
import { KiorexOverviewService } from "./kiorex-overview.service";
import { KiorexReviewsService } from "./kiorex-reviews.service";
import { KiorexSettingsService, type PutKiorexSettingsBody } from "./kiorex-settings.service";
import { KiorexSettingsReplyBodyDto } from "./kiorex-settings.controller.dto";

@ApiTags("kiorex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kiorex")
export class KiorexSettingsController {
  constructor(
    private readonly settings: KiorexSettingsService,
    private readonly reviews: KiorexReviewsService,
    private readonly bookingPages: ClinicBookingPageService,
    private readonly overviewSvc: KiorexOverviewService,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Kiorex performance for a clinic and month: views, bookings, attendance, commission, free progress, rating (KX-10)" })
  overview(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string, @Query("period") period?: string) {
    return this.overviewSvc.overview(user, clinicId, period);
  }

  @Get("settings")
  @ApiOperation({ summary: "Kiorex tab settings for a clinic (KX-06 / KX-10)" })
  get(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.settings.get(user, clinicId);
  }

  @Put("settings")
  @ApiOperation({ summary: "Update Kiorex tab settings for a clinic (KX-06 / KX-10)" })
  put(@CurrentUser() user: JwtUser, @Body() body: PutKiorexSettingsBody) {
    return this.settings.put(user, body);
  }

  @Get("ratings")
  @ApiOperation({ summary: "Kiorex ratings per doctor and recent verified reviews (KX-08)" })
  ratings(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.reviews.listForClinic(user, clinicId);
  }

  @Post("reviews/:id/reply")
  @ApiOperation({ summary: "Reply to a Kiorex review; Kiorex publishes and moderates it (KX-08)" })
  reply(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: KiorexSettingsReplyBodyDto) {
    return this.reviews.reply(user, id, body?.text);
  }

  @Get("booking-link")
  @ApiOperation({ summary: "Clinic and per-doctor booking page links (KX-09, commission-free)" })
  bookingLink(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.bookingPages.getForClinic(user, clinicId);
  }

  @Put("booking-link")
  @ApiOperation({ summary: "Change the clinic or a doctor's booking page slug (KX-09)" })
  updateBookingLink(@CurrentUser() user: JwtUser, @Body() body: PutBookingSlugBody) {
    return this.bookingPages.updateSlug(user, body);
  }
}
