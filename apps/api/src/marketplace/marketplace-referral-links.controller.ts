import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProviderLinkCoreService } from "../growth/provider-links/provider-link-core.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";

/**
 * Link registry read side (contracts 1.11.0, marketplace OpenAPI 1.5.0). Same HMAC as every marketplace call. Kiorex asks which organisation owns a link code
 * and whether it is still active; it is the repair path when a `ReferralLinkCreated` or `ReferralLinkRevoked` event was missed. No patient data.
 */
@ApiTags("marketplace")
@Controller("marketplace/v1/referral-links")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Client-Secret", required: true })
@ApiHeader({ name: "X-Kiorly-Timestamp", required: true })
@ApiHeader({ name: "X-Kiorly-Nonce", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class MarketplaceReferralLinksController {
  constructor(private readonly links: ProviderLinkCoreService) {}

  @Get()
  @ApiOperation({ summary: "Link registry reconciliation feed: links changed since a timestamp, oldest first (cursor pagination)" })
  async list(@Query("updatedSince") updatedSince?: string, @Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    let since: Date | undefined;
    if (updatedSince) {
      since = new Date(updatedSince);
      if (Number.isNaN(since.getTime())) throw new BadRequestException({ code: "INVALID_UPDATED_SINCE", message: "updatedSince must be an ISO 8601 timestamp" });
    }
    return this.links.listRecords({ updatedSince: since, limit: limit ? Number(limit) : undefined, cursor });
  }

  @Get(":code")
  @ApiOperation({ summary: "Signed lookup of one referral link: organisation, scope, channel and status (ACTIVE, PAUSED, REVOKED)" })
  async get(@Param("code") code: string) {
    const rec = await this.links.lookupRecord(code);
    if (!rec) throw new NotFoundException({ statusCode: 404, code: "REFERRAL_LINK_NOT_FOUND", message: "No referral link with this code" });
    return rec;
  }
}
