import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { B2bModule } from "./b2b/b2b.module";
import { GrowthReferralController } from "./growth-referral.controller";
import { GrowthReferralService } from "./growth-referral.service";
import { ReferralAttributionService } from "./referral-attribution.service";
import { ReferralCodeService } from "./referral-code.service";
import { ReferralRewardService } from "./referral-reward.service";

@Module({
  imports: [CreditsModule, B2bModule],
  controllers: [GrowthReferralController],
  providers: [
    ReferralCodeService,
    ReferralAttributionService,
    ReferralRewardService,
    GrowthReferralService,
  ],
  exports: [ReferralCodeService, ReferralAttributionService, ReferralRewardService],
})
export class GrowthModule {}