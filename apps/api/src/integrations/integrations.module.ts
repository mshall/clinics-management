import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { IntegrationAdminController } from "./integration-admin.controller";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationsAppointmentsController } from "./integrations-appointments.controller";
import { IntegrationsAppointmentsService } from "./integrations-appointments.service";

@Module({
  imports: [AppointmentsModule, AuditModule],
  controllers: [IntegrationsAppointmentsController, IntegrationAdminController],
  providers: [IntegrationClientService, IntegrationsAppointmentsService, IntegrationAuthGuard],
})
export class IntegrationsModule {}
