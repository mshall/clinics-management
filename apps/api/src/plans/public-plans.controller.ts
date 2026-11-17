import { Controller, Get, Header, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PlansService } from "./plans.service";

@ApiTags("public")
@Controller("public/plans")
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
  @ApiOperation({ summary: "Public plan catalog and active market prices (no auth)" })
  @ApiOkResponse()
  list(@Query("market") market?: string) {
    return this.plans.listPublicPlans(market?.trim() || "EG");
  }
}