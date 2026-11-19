import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { ClinicBookingPageService } from "./clinic-booking-page.service";

@ApiTags("public")
@Controller("public/booking-pages")
@UseGuards(PublicAuthRateLimitGuard)
export class PublicBookingPageController {
  constructor(private readonly pages: ClinicBookingPageService) {}

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  @ApiOperation({ summary: "Clinic-branded booking page (KX-09, commission-free CLINIC_LINK channel; no auth)" })
  @ApiOkResponse()
  get(@Param("slug") slug: string) {
    return this.pages.publicPage(slug);
  }
}
