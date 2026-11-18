import { forwardRef, Module } from "@nestjs/common";
import { ClinicianVerificationModule } from "../clinician-verification/clinician-verification.module";
import { MessagingModule } from "../messaging/messaging.module";
import { SchedulingController } from "./scheduling.controller";
import { SchedulingService } from "./scheduling.service";
import { SlotService } from "./slot.service";

@Module({
  imports: [ClinicianVerificationModule, forwardRef(() => MessagingModule)],
  controllers: [SchedulingController],
  providers: [SchedulingService, SlotService],
  exports: [SchedulingService, SlotService],
})
export class SchedulingModule {}