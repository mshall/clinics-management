import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { PatientsModule } from "../patients/patients.module";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { BillingModule } from "../billing/billing.module";
import { FrontDeskController } from "./front-desk.controller";
import { FrontDeskFlowModule } from "./front-desk-flow.module";
import { FrontDeskService } from "./front-desk.service";

@Module({
  imports: [PatientsModule, FrontDeskFlowModule, StorageModule, ComplianceModule, SubscriptionsModule, KiorexModule, BillingModule],
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
})
export class FrontDeskModule {}
