import { Body, Controller, Get, HttpCode, NotFoundException, Param, Put, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { KiorexConnectService } from "./kiorex-connect.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { KiorexConnectionDecideBodyDto } from "./kiorex-connection.controller.dto";

/** Kiorex -> Clinic over the signed marketplace API: ops decisions for a connection request and the signed ping used by the onboarding checks. No PHI. */
@ApiTags("marketplace")
@Controller("marketplace/v1/connection")
@UseGuards(MarketplaceAuthGuard)
export class KiorexConnectionController {
  constructor(private readonly connect: KiorexConnectService) {}

  @Get(":orgRef")
  @ApiOperation({ summary: "Signed ping: does this deployment know the organisation, and how many of its listings are ready (counts only)" })
  async ping(@Param("orgRef") orgRef: string) {
    const r = await this.connect.connectionSummary(orgRef, orgRef);
    if (!r) throw new NotFoundException({ code: "ORG_NOT_FOUND" });
    return r;
  }

  @Put(":orgRef")
  @HttpCode(200)
  @ApiOperation({ summary: "Ops decision: IN_REVIEW | CHANGES_REQUESTED | REJECTED | APPROVED | PAUSED. Idempotent; APPROVED recomputes the listings (LIVE when every gate is green)" })
  async decide(@Param("orgRef") orgRef: string, @Body() body: KiorexConnectionDecideBodyDto) {
    const r = await this.connect.applyDecision(orgRef, body.decision, body.reasonCode, body.connectionId);
    if (!r) throw new NotFoundException({ code: "ORG_NOT_FOUND" });
    return { orgRef, status: r.status };
  }
}
