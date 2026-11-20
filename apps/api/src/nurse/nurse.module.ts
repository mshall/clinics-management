import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { EncountersModule } from "../encounters/encounters.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { HomeVisitsModule } from "../home-visits/home-visits.module";
import { MessagingModule } from "../messaging/messaging.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ScopeOfPracticeModule } from "../scope-of-practice/scope-of-practice.module";
import { SignupModule } from "../signup/signup.module";
import { AgencyService } from "./agency.service";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import { CarePlanRequestService } from "./care-plan-request.service";
import { CarePlanService } from "./care-plan.service";
import { DoctorOrderService } from "./doctor-order.service";
import { FamilyUpdateService } from "./family-update.service";
import { LabSampleService } from "./lab-sample.service";
import { NurseLabController } from "./nurse-lab.controller";
import { RecordShareService } from "../marketplace/record-share.service";
import { MedicationAdministrationService } from "./medication-administration.service";
import { NurseAgencyController } from "./nurse-agency.controller";
import { NurseClinicalController } from "./nurse-clinical.controller";
import { NurseEditionController, NursePublicController } from "./nurse-edition.controller";
import { NurseEditionService } from "./nurse-edition.service";
import { NurseMarController } from "./nurse-mar.controller";
import { NurseReportsService } from "./nurse-reports.service";
import { ShiftService } from "./shift.service";
import { VisitRecordService } from "./visit-record.service";

@Module({
  imports: [AppointmentsModule, AuditModule, EncountersModule, EntitlementsModule, FeatureFlagsModule, HomeVisitsModule, MessagingModule, SchedulingModule, ScopeOfPracticeModule, SignupModule],
  controllers: [NursePublicController, NurseEditionController, NurseClinicalController, NurseMarController, NurseAgencyController, NurseLabController],
  providers: [NurseEditionService, CarePlanService, CarePlanRequestService, MarketplacePatientIntakeService, VisitRecordService, DoctorOrderService, MedicationAdministrationService, ShiftService, FamilyUpdateService, AgencyService, NurseReportsService, LabSampleService, RecordShareService],
  exports: [NurseEditionService, CarePlanRequestService, DoctorOrderService, FamilyUpdateService, LabSampleService, VisitRecordService],
})
export class NurseModule {}
