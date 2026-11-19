import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { Patient360Service } from "./patient-360.service";
import { MessagingConsentService } from "./messaging-consent.service";
import { NewPatientService } from "./new-patient.service";
import { ProvisionalPatientService } from "./provisional-patient.service";

@Module({
  imports: [AuditModule, ComplianceModule, UserNavTabsModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    Patient360Service,
    MessagingConsentService,
    NewPatientService,
    ProvisionalPatientService,
  ],
  exports: [
    PatientsService,
    Patient360Service,
    MessagingConsentService,
    NewPatientService,
    ProvisionalPatientService,
  ],
})
export class PatientsModule {}
