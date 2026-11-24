import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PatchOnboardingStepDto } from "./dto/patch-onboarding-step.dto";
import { OnboardingService, viewerFromUser } from "./onboarding.service";
import { SampleDataService } from "./sample-data.service";

@ApiTags("onboarding")
@ApiBearerAuth("bearer")
@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly sampleData: SampleDataService,
  ) {}

  @Get("sample-data")
  @ApiOperation({ summary: "Current sample patient, if any (ON-08)" })
  async getSampleData(@CurrentUser() user: JwtUser) {
    return { sample: await this.sampleData.get(requireTenantId(user)) };
  }

  @Post("sample-data")
  @ApiOperation({ summary: "Create a clearly marked sample patient + appointment (ON-08)" })
  createSampleData(@CurrentUser() user: JwtUser) {
    return this.sampleData.create(requireTenantId(user), user);
  }

  @Delete("sample-data")
  @ApiOperation({ summary: "Remove all sample data (ON-08)" })
  removeSampleData(@CurrentUser() user: JwtUser) {
    return this.sampleData.remove(requireTenantId(user), user);
  }

  @Get()
  @ApiOperation({ summary: "Quick-setup checklist: per-step and per-clinic state computed from real data (ON-04)" })
  getProgress(@CurrentUser() user: JwtUser) {
    const tenantId = requireTenantId(user);
    return this.onboarding.getOrCreate(tenantId, viewerFromUser(user), user.userId);
  }

  @Patch("steps/:key")
  @ApiOperation({ summary: "Skip an optional step (optionally for one clinic). Steps are never ticked by hand." })
  patchStep(@CurrentUser() user: JwtUser, @Param("key") key: string, @Body() body: PatchOnboardingStepDto) {
    const tenantId = requireTenantId(user);
    return this.onboarding.patchStep(tenantId, user.userId, key, body.action, body.entityId, viewerFromUser(user));
  }

  @Post("dismiss")
  @ApiOperation({ summary: "Dismiss the finished checklist for the organisation" })
  dismiss(@CurrentUser() user: JwtUser) {
    return this.onboarding.dismiss(requireTenantId(user), user.userId, viewerFromUser(user));
  }
}
