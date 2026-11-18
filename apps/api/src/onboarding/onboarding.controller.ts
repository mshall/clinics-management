import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PatchOnboardingStepDto } from "./dto/patch-onboarding-step.dto";
import { OnboardingService } from "./onboarding.service";
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