import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DepositLinkService } from "./deposit-link.service";

@ApiTags("public")
@Controller("public/deposit-links")
export class PublicDepositLinkController {
  constructor(private readonly links: DepositLinkService) {}

  @Get(":token")
  @ApiOperation({ summary: "FS-04 — pay-page context for a clinic deposit link (amount, clinic, how to pay)" })
  summary(@Param("token") token: string) {
    return this.links.publicSummary(token);
  }
}
