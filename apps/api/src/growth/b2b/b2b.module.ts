import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../../feature-flags/feature-flags.module";
import { B2bMobileController } from "./b2b-mobile.controller";
import { B2bReferralController } from "./b2b-referral.controller";
import { B2bReferralService } from "./b2b-referral.service";

/** GRW-P4-C provider "Refer a company". AuditService, OutboxEventService and PrismaService come from their global modules like the other growth services. */
@Module({ imports: [FeatureFlagsModule], controllers: [B2bReferralController, B2bMobileController], providers: [B2bReferralService], exports: [B2bReferralService] })
export class B2bModule {}
