import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { AuditModule } from "../audit/audit.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { ClinicalModule } from "../clinical/clinical.module";
import { PatientsModule } from "../patients/patients.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { MessagingModule } from "../messaging/messaging.module";
import { RecordShareModule } from "../marketplace/record-share.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";

@Module({
  imports: [
    UserNavTabsModule,
    PatientsModule,
    FrontDeskFlowModule,
    ClinicalModule,
    AuditModule,
    KiorexModule,
    RecordShareModule,
    MessagingModule,
  ],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
