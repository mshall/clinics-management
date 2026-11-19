import { forwardRef, Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentReminderScheduler } from "./appointment-reminder.scheduler";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { InternalOutboxConsumerService } from "./internal-outbox-consumer.service";
import { OwnerNotificationsService } from "./owner-notifications.service";
import { InstallmentRemindersController } from "./installment-reminders.controller";
import { InstallmentRemindersService } from "./installment-reminders.service";
import { WaitlistAutofillService } from "./waitlist-autofill.service";
import { OutboundMessageWorker } from "./outbound-message.worker";
import { WhatsAppSendService } from "./whatsapp-send.service";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { WhatsAppInboundRepliesService } from "./whatsapp-inbound-replies.service";
import { OutboxEventService } from "./outbox-event.service";
import { OutboxDeliveryService } from "./outbox-delivery.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxDispatcherScheduler } from "./outbox-dispatcher.scheduler";
import { AppointmentOutboxService } from "./appointment-outbox.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { PublicAppointmentRescheduleController } from "./public-appointment-reschedule.controller";
import { DigestsController } from "./digests.controller";
import { DigestsService } from "./digests.service";

@Module({
  imports: [AuditModule, forwardRef(() => SchedulingModule), PatientsModule],
  controllers: [
    MessagingController,
    WhatsAppWebhookController,
    PublicAppointmentRescheduleController,
    InstallmentRemindersController,
    DigestsController,
  ],
  providers: [
    WaitlistAutofillService,
    MessagingService,
    OwnerNotificationsService,
    DigestsService,
    InternalOutboxConsumerService,
    InstallmentRemindersService,
    WhatsAppSendService,
    WhatsAppWebhookService,
    WhatsAppInboundRepliesService,
    OutboxEventService,
    OutboxDeliveryService,
    OutboxDispatcherService,
    OutboxDispatcherScheduler,
    AppointmentOutboxService,
    AppointmentRescheduleTokenService,
    OutboundMessageWorker,
    AppointmentReminderScheduler,
  ],
  exports: [
    WaitlistAutofillService,
    MessagingService,
    OwnerNotificationsService,
    DigestsService,
    InternalOutboxConsumerService,
    AppointmentReminderScheduler,
    WhatsAppSendService,
    OutboxEventService,
    OutboxDispatcherService,
    AppointmentOutboxService,
  ],
})
export class MessagingModule {}