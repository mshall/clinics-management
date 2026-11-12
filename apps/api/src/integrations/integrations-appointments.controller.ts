import { Body, Controller, Get, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IntegrationScope } from "@prisma/client";
import { AppointmentDto } from "../appointments/dto/appointment.dto";
import { IntegrationBookAppointmentDto } from "./dto/integration-book-appointment.dto";
import { IntegrationClient, RequireIntegrationScopes } from "./integration-auth.decorator";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationsAppointmentsService } from "./integrations-appointments.service";
import { IntegrationFailureExceptionFilter } from "./integration-failure.filter";

@ApiTags("integrations")
@ApiBearerAuth("integration")
@Controller("integrations")
@UseGuards(IntegrationAuthGuard)
@UseFilters(IntegrationFailureExceptionFilter)
export class IntegrationsAppointmentsController {
  constructor(private readonly integrationAppointments: IntegrationsAppointmentsService) {}

  @Get("auth/verify")
  @ApiOperation({ summary: "Verify integration API token and return granted scopes" })
  verify(@IntegrationClient() client: IntegrationPrincipal) {
    return {
      ok: true,
      clientKey: client.clientKey,
      name: client.name,
      tenantId: client.tenantId,
      scopes: client.scopes,
    };
  }

  @Get("clinics")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_READ)
  @ApiOperation({ summary: "List bookable clinics for this integration client" })
  listClinics(@IntegrationClient() client: IntegrationPrincipal) {
    return this.integrationAppointments.listClinics(client);
  }

  @Get("physicians")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_READ)
  @ApiOperation({ summary: "List physicians available for booking at a clinic" })
  listPhysicians(@IntegrationClient() client: IntegrationPrincipal, @Query("clinicId") clinicId: string) {
    return this.integrationAppointments.listPhysicians(client, clinicId);
  }

  @Get("appointments/availability")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_READ)
  @ApiOperation({ summary: "Busy intervals for a clinician (plan external slot picker)" })
  availability(
    @IntegrationClient() client: IntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.integrationAppointments.listAvailability(client, clinicId, clinicianId, from, to);
  }

  @Post("appointments")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_WRITE)
  @ApiOperation({ summary: "Book an appointment from an external patient platform" })
  book(@IntegrationClient() client: IntegrationPrincipal, @Body() body: IntegrationBookAppointmentDto) {
    return this.integrationAppointments.book(client, body);
  }

  @Get("appointments/:id")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_READ)
  @ApiOperation({ summary: "Get appointment created by this integration client" })
  getOne(@IntegrationClient() client: IntegrationPrincipal, @Param("id") id: string): Promise<AppointmentDto> {
    return this.integrationAppointments.getOne(client, id);
  }

  @Post("appointments/:id/cancel")
  @RequireIntegrationScopes(IntegrationScope.APPOINTMENTS_WRITE)
  @ApiOperation({ summary: "Cancel an integration-booked appointment" })
  cancel(@IntegrationClient() client: IntegrationPrincipal, @Param("id") id: string): Promise<AppointmentDto> {
    return this.integrationAppointments.cancel(client, id);
  }
}
