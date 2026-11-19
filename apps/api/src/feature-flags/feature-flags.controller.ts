import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureFlagsService } from "./feature-flags.service";

/** FF04/FF05: effective flag values for the signed-in organization (drives `<Feature>` and the org flag page). */
@ApiTags("feature-flags")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("feature-flags")
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get("effective")
  @ApiOperation({ summary: "Effective feature flags (value + deciding source) for the current organization" })
  @ApiOkResponse()
  async effective(@CurrentUser() user: JwtUser) {
    const flags = user.tenantId ? await this.flags.listForTenant(user.tenantId) : [];
    return {
      managed: this.flags.isManaged(),
      snapshot: this.flags.snapshotMeta(),
      flags: flags.map((f) => ({
        key: f.key,
        effective: f.effective,
        source: f.source,
        awaitingGate: f.awaitingGate,
        class: f.class,
        scopes: f.scopes,
        dependsOn: f.dependsOn,
        description: f.description,
        descriptionAr: f.descriptionAr,
      })),
    };
  }
}
