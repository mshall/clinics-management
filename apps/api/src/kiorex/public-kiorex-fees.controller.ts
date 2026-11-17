import { Controller, Get, Header, NotFoundException, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { KiorexCommissionService } from "./kiorex-commission.service";

@ApiTags("public")
@Controller("public/kiorex-fees")
export class PublicKiorexFeesController {
  constructor(private readonly kiorex: KiorexCommissionService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
  @ApiOperation({ summary: "Public Kiorex fee card per market (no auth)" })
  @ApiOkResponse()
  async list(@Query("market") market?: string) {
    try {
      return await this.kiorex.listPublic(market?.trim() || "EG");
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw e;
    }
  }
}