import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { providerStatus } from "../common/provider-env";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness probe" })
  @ApiOkResponse({
    schema: { type: "object", properties: { status: { type: "string", example: "ok" } } },
  })
  live() {
    return { status: "ok" };
  }

  @Get("providers")
  @ApiOperation({ summary: "Active mode (mock|real), vendor and readiness of every external provider (no secrets)" })
  providers() {
    return { providers: providerStatus() };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (database connectivity)" })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        database: { type: "string", example: "ok" },
      },
    },
  })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok", providers: providerStatus() };
    } catch {
      throw new ServiceUnavailableException({ status: "degraded", database: "unavailable" });
    }
  }
}
