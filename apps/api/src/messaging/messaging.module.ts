import { forwardRef, Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { SupportModule } from "../support/support.module";
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
import { EmailService } from "./email.service";
import { EmailOutboxService } from "./email-outbox.service";
import { EmailBounceController } from "./email-bounce.controller";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { WhatsAppAiReceptionistController } from "./whatsapp-ai-receptionist.controller";
import { WhatsAppAiReceptionistService } from "./whatsapp-ai-receptionist.service";

@Module({
  imports: [AuditModule, forwardRef(() => SchedulingModule), PatientsModule, SupportModule],
  controllers: [
    MessagingController,
    WhatsAppWebhookController,
    PublicAppointmentRescheduleController,
    InstallmentRemindersController,
    DigestsController,
    EmailBounceController,
    WhatsAppAiReceptionistController,
  ],
  providers: [
    WaitlistAutofillService,
    MessagingService,
    OwnerNotificationsService,
    DigestsService,
    ScheduledReportsService,
    EmailService,
    EmailOutboxService,
    InternalOutboxConsumerService,
    InstallmentRemindersService,
    WhatsAppSendService,
    WhatsAppWebhookService,
    WhatsAppInboundRepliesService,
    WhatsAppAiReceptionistService,
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
    ScheduledReportsService,
    EmailService,
    EmailOutboxService,
    InternalOutboxConsumerService,
    AppointmentReminderScheduler,
    WhatsAppSendService,
    OutboxEventService,
    OutboxDispatcherService,
    AppointmentOutboxService,
    WhatsAppWebhookService,
  ],
})
export class MessagingModule {}