import { Module } from "@nestjs/common";
import { AppointmentReminderScheduler } from "./appointment-reminder.scheduler";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { OutboundMessageWorker } from "./outbound-message.worker";

@Module({
  controllers: [MessagingController],
  providers: [MessagingService, OutboundMessageWorker, AppointmentReminderScheduler],
  exports: [MessagingService, AppointmentReminderScheduler],
})
export class MessagingModule {}
