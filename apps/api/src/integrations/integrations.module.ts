import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { MessagingModule } from "../messaging/messaging.module";
import { AuditModule } from "../audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { OperationsModule } from "../operations/operations.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { IntegrationAdminController } from "./integration-admin.controller";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationWebhookService } from "./integration-webhook.service";
import { IntegrationWebhooksAdminController } from "./integration-webhooks-admin.controller";
import { IntegrationsAppointmentsController } from "./integrations-appointments.controller";
import { IntegrationsAppointmentsService } from "./integrations-appointments.service";
import { IntegrationsOperationsController } from "./integrations-operations.controller";
import { IntegrationsOperationsService } from "./integrations-operations.service";
import { IntegrationFailureExceptionFilter } from "./integration-failure.filter";
import { IntegrationFailureLogService } from "./integration-failure-log.service";
import { IntegrationFailureRetentionService } from "./integration-failure-retention.service";
import { IntegrationFailureGovernanceService } from "./integration-failure-governance.service";
@Module({
  imports: [
    AppointmentsModule,
    OperationsModule,
    AuditModule,
    ComplianceModule,
    SubscriptionsModule,
    SchedulingModule,
    MessagingModule,
  ],
  controllers: [
    IntegrationsAppointmentsController,
    IntegrationsOperationsController,
    IntegrationAdminController,
    IntegrationWebhooksAdminController,
  ],
  providers: [
    IntegrationClientService,
    IntegrationWebhookService,
    IntegrationsAppointmentsService,
    IntegrationsOperationsService,
    IntegrationAuthGuard,
    IntegrationFailureLogService,
    IntegrationFailureExceptionFilter,
    IntegrationFailureRetentionService,
    IntegrationFailureGovernanceService,
  ],
  exports: [
    IntegrationFailureLogService,
    IntegrationWebhookService,
    IntegrationFailureRetentionService,
    IntegrationsAppointmentsService,
  ],
})
export class IntegrationsModule {}
