import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { Patient360Service } from "./patient-360.service";
import { MessagingConsentService } from "./messaging-consent.service";
import { NewPatientService } from "./new-patient.service";

@Module({
  imports: [AuditModule, ComplianceModule],
  controllers: [PatientsController],
  providers: [PatientsService, Patient360Service, MessagingConsentService, NewPatientService],
  exports: [PatientsService, Patient360Service, MessagingConsentService, NewPatientService],
})
export class PatientsModule {}
