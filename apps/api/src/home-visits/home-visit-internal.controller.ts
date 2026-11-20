import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { InternalJobKeyGuard } from "./internal-job-key.guard";
import { HomeVisitPrivacyService } from "./home-visit-privacy.service";
import { HomeVisitSafetyService } from "./home-visit-safety.service";

/**
 * Scheduled jobs (infra: EventBridge Scheduler -> job-runner Lambda -> POST here with `X-Internal-Job-Key`, secret `INTERNAL_JOB_KEY`).
 * Infrastructure owns only the clock; the 12-month logic lives here. All jobs are idempotent and batched.
 */
@ApiTags("internal")
@ApiExcludeController()
@Controller("internal/jobs")
@UseGuards(InternalJobKeyGuard)
export class HomeVisitInternalController {
  constructor(
    private readonly privacy: HomeVisitPrivacyService,
    private readonly safety: HomeVisitSafetyService,
  ) {}

  @Post("geostamp-retention-purge")
  @HttpCode(200)
  geostampRetentionPurge() {
    return this.privacy.purgeGeostamps();
  }

  @Post("home-visit-address-mask")
  @HttpCode(200)
  async addressMask() {
    return { masked: await this.privacy.maskExpiredAddresses() };
  }

  @Post("home-visit-safety-tick")
  @HttpCode(200)
  safetyTick() {
    return this.safety.tick();
  }
}
