import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { isLikelyBot } from "../growth/provider-links/link-counters";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { ClinicBookingPageService } from "./clinic-booking-page.service";

@ApiTags("public")
@Controller("public/booking-pages")
@UseGuards(PublicAuthRateLimitGuard)
export class PublicBookingPageController {
  constructor(private readonly pages: ClinicBookingPageService) {}

  @Get(":slug")
  @ApiOperation({ summary: "Clinic-branded booking page (KX-09, commission-free CLINIC_LINK channel; no auth). `?s=<code>` attributes the visit to a provider link (counted without cookies) and returns a signed `lt`." })
  @ApiOkResponse()
  async get(@Param("slug") slug: string, @Query("s") s: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // A tracked visit must never be served from a shared cache (it would hide the count); the plain page stays cacheable.
    res.setHeader("Cache-Control", s ? "no-store" : "public, max-age=60, stale-while-revalidate=300");
    return this.pages.publicPage(slug, { s: typeof s === "string" ? s : null, bot: isLikelyBot(req.headers) });
  }
}
