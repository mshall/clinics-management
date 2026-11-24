import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../../feature-flags/feature-flags.module";
import { OutboxEventService } from "../../messaging/outbox-event.service";
import { B2bMobileController } from "./b2b-mobile.controller";
import { B2bReferralController } from "./b2b-referral.controller";
import { B2bReferralService } from "./b2b-referral.service";

/** GRW-P4-C provider "Refer a company". AuditService and PrismaService come from their global modules; OutboxEventService is Prisma-only and provided here like in VerificationCoreModule. */
@Module({ imports: [FeatureFlagsModule], controllers: [B2bReferralController, B2bMobileController], providers: [B2bReferralService, OutboxEventService], exports: [B2bReferralService] })
export class B2bModule {}
