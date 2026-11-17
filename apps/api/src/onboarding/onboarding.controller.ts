import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PatchOnboardingStepDto } from "./dto/patch-onboarding-step.dto";
import { OnboardingService } from "./onboarding.service";

@ApiTags("onboarding")
@ApiBearerAuth("bearer")
@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: "Tenant activation checklist (ON-04)" })
  getProgress(@CurrentUser() user: JwtUser) {
    const tenantId = requireTenantId(user);
    return this.onboarding.getOrCreate(tenantId);
  }

  @Patch("steps/:key")
  @ApiOperation({ summary: "Mark step complete or skip (optional steps only)" })
  patchStep(@CurrentUser() user: JwtUser, @Param("key") key: string, @Body() body: PatchOnboardingStepDto) {
    const tenantId = requireTenantId(user);
    return this.onboarding.patchStep(tenantId, user.userId, key, body.action);
  }
}