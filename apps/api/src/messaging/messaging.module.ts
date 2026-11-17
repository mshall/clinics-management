import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentReminderScheduler } from "./appointment-reminder.scheduler";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { OutboundMessageWorker } from "./outbound-message.worker";
import { WhatsAppSendService } from "./whatsapp-send.service";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { OutboxEventService } from "./outbox-event.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { PublicAppointmentRescheduleController } from "./public-appointment-reschedule.controller";

@Module({
  imports: [AuditModule, SchedulingModule, PatientsModule],
  controllers: [MessagingController, WhatsAppWebhookController, PublicAppointmentRescheduleController],
  providers: [
    MessagingService,
    WhatsAppSendService,
    WhatsAppWebhookService,
    WhatsAppInboundRepliesService,
    OutboxEventService,
    AppointmentRescheduleTokenService,
    OutboundMessageWorker,
    AppointmentReminderScheduler,
  ],
  exports: [MessagingService, AppointmentReminderScheduler, WhatsAppSendService],
})
export class MessagingModule {}