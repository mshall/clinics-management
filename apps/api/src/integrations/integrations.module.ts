import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { OperationsModule } from "../operations/operations.module";
import { IntegrationAdminController } from "./integration-admin.controller";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationWebhookService } from "./integration-webhook.service";
import { IntegrationWebhooksAdminController } from "./integration-webhooks-admin.controller";
import { IntegrationsAppointmentsController } from "./integrations-appointments.controller";
import { IntegrationsAppointmentsService } from "./integrations-appointments.service";
import { IntegrationsOperationsController } from "./integrations-operations.controller";
import { IntegrationsOperationsService } from "./integrations-operations.service";

@Module({
  imports: [AppointmentsModule, OperationsModule, AuditModule],
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
  ],
})
export class IntegrationsModule {}
