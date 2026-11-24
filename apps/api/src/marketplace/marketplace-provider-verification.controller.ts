import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { VerificationRequestsService } from "../growth/provider-marketing/verification-requests.service";
import { VerificationDecisionBodyDto } from "../growth/provider-marketing/provider-marketing.dto";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";

/**
 * GRW-P2-C signed channel for provider verification updates (events `ProviderVerificationUpdateRequested` and `ProviderVerificationDecided`, contracts 1.12.0).
 * The event never carries the new value; Kiorex ops reads it here, and delivers the decision here. Same HMAC as every marketplace call.
 */
@ApiTags("marketplace")
@Controller("marketplace/v1/provider-verification")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Client-Secret", required: true })
@ApiHeader({ name: "X-Kiorly-Timestamp", required: true })
@ApiHeader({ name: "X-Kiorly-Nonce", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class MarketplaceProviderVerificationController {
  constructor(private readonly requests: VerificationRequestsService) {}

  @Get("requests/:requestRef")
  @ApiOperation({ summary: "Kiorex reads one verification update request: field, requested value and evidence file references" })
  read(@Param("requestRef") requestRef: string) {
    return this.requests.readForKiorex(requestRef);
  }

  @Post("decisions")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex ops decision (APPROVED, REJECTED, NEEDS_INFO) for a verification update request; idempotent" })
  decide(@Body() body: VerificationDecisionBodyDto) {
    return this.requests.applyDecision(body);
  }
}
