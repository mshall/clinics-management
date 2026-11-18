import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { MarketplaceListingService } from "./marketplace-listing.service";

@ApiTags("marketplace")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("marketplace/listings")
export class MarketplaceOrgController {
  constructor(private readonly listings: MarketplaceListingService) {}

  @Get()
  @ApiOperation({ summary: "Per-doctor Kiorex listing status at a clinic" })
  list(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string, @Query("sync") sync?: string) {
    return this.listings.listClinicListings(user, clinicId, sync !== "false");
  }

  @Post(":id/pause")
  @ApiOperation({ summary: "Owner pause or resume marketplace listing" })
  pause(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("paused") paused?: string) {
    const isPaused = paused !== "false";
    return this.listings.pauseByOwner(user, id, isPaused);
  }
}