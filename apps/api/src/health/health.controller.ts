import { Controller, ForbiddenException, Get, Req, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { hasInternalHealthAccess } from "../common/internal-access";
import { providerStatus } from "../common/provider-env";
import { leadSigningStatus } from "../common/lead-signing-status";

type HealthReq = { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } };

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
  providers(@Req() req: HealthReq) {
    // KX-PT-L2: the provider directory is for the VPC / operators, not for the internet
    if (!hasInternalHealthAccess(req)) throw new ForbiddenException({ code: "INTERNAL_ONLY", message: "Provider status is available to internal callers only" });
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
  async ready(@Req() req: HealthReq) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // KX-PT-L2: the public answer says only that the process is ready; provider modes, vendors and the lead-signing state go to internal callers
      if (!hasInternalHealthAccess(req)) return { status: "ok", database: "ok" };
      return { status: "ok", database: "ok", providers: providerStatus(), leadSigning: leadSigningStatus() };
    } catch {
      throw new ServiceUnavailableException({ status: "degraded", database: "unavailable" });
    }
  }
}
