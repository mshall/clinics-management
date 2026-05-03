import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get("live")
  @ApiOperation({ summary: "Liveness probe" })
  @ApiOkResponse({
    schema: { type: "object", properties: { status: { type: "string", example: "ok" } } },
  })
  live() {
    return { status: "ok" };
  }
}
