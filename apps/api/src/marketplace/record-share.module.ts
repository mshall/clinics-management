import { Module } from "@nestjs/common";
import { RecordShareClinicController } from "./record-share-clinic.controller";
import { RecordShareService } from "./record-share.service";

/** Standalone — does not import MessagingModule (avoids Nest circular graphs via Patients/Encounters). */
@Module({
  controllers: [RecordShareClinicController],
  providers: [RecordShareService],
  exports: [RecordShareService],
})
export class RecordShareModule {}
