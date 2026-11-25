import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PatientsModule } from "../patients/patients.module";
import { CommissionChargeScheduler } from "./commission-charge.scheduler";
import { CommissionChargeService } from "./commission-charge.service";
import { CommissionDisputeService } from "./commission-dispute.service";
import { AttributionEvidenceService } from "./attribution-evidence.service";
import { CommissionDecisionsController } from "./commission-decisions.controller";
import { CommissionDecisionsService } from "./commission-decisions.service";
import { KiorexBillingChargesController } from "./kiorex-billing-charges.controller";
import { CommissionCollectionsController } from "./commission-collections.controller";
import { CommissionCollectionsService } from "./commission-collections.service";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { PlatformCommissionDisputesController } from "./platform-commission-disputes.controller";
import { PlatformKiorexRatesController } from "./platform-kiorex-rates.controller";
import { PublicKiorexFeesController } from "./public-kiorex-fees.controller";

@Module({
  imports: [CreditsModule, MessagingModule, PatientsModule],
  controllers: [
    PlatformKiorexRatesController,
    PlatformCommissionDisputesController,
    PublicKiorexFeesController,
    KiorexBillingChargesController,
    CommissionCollectionsController,
    CommissionDecisionsController,
  ],
  providers: [CommissionCollectionsService, KiorexCommissionService, CommissionChargeService, CommissionDisputeService, CommissionChargeScheduler, AttributionEvidenceService, CommissionDecisionsService],
  exports: [CommissionCollectionsService, KiorexCommissionService, CommissionChargeService, CommissionDisputeService, AttributionEvidenceService, CommissionDecisionsService],
})
export class KiorexModule {}