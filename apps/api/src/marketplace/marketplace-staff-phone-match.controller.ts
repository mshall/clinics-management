import { BadRequestException, Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { parseStaffMatchHashes, StaffPhoneMatchService } from "../growth/staff-phone-match.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";

/**
 * `GET /marketplace/v1/growth/staff-phone-match?clinicId=&hashes=` (contracts 1.13.0, marketplace OpenAPI 1.7.0). Same HMAC as every marketplace call.
 * Kiorex sends keyed phone hashes and receives `{match: boolean}` for the referral fraud rule RF_PROVIDER_COLLUSION. No name, phone or count ever leaves the Clinic.
 */
@ApiTags("marketplace")
@Controller("marketplace/v1/growth/staff-phone-match")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Client-Secret", required: true })
@ApiHeader({ name: "X-Kiorly-Timestamp", required: true })
@ApiHeader({ name: "X-Kiorly-Nonce", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class MarketplaceStaffPhoneMatchController {
  constructor(private readonly match: StaffPhoneMatchService) {}

  @Get()
  @ApiOperation({ summary: "Does any of these keyed phone hashes belong to staff of the clinic's organisation? (one boolean, never the person)" })
  async get(@Query("clinicId") clinicId: string | undefined, @Query("hashes") hashes: string | undefined, @Headers("x-kiorly-client-secret") secret: string | undefined) {
    if (!clinicId || clinicId.length > 64) throw new BadRequestException({ code: "INVALID_CLINIC", message: "clinicId is required" });
    if (!secret) throw new BadRequestException({ code: "INVALID_CLIENT", message: "client secret header required" });
    return { match: await this.match.matches(clinicId, parseStaffMatchHashes(hashes), secret) };
  }
}
