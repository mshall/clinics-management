import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IntegrationScope } from "@prisma/client";
import { OperationDto } from "../operations/dto/operation.dto";
import { IntegrationBookOperationDto } from "./dto/integration-book-operation.dto";
import { IntegrationClient, RequireIntegrationScopes } from "./integration-auth.decorator";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import type { IntegrationPrincipal } from "./integration.types";
import { IntegrationsOperationsService } from "./integrations-operations.service";

@ApiTags("integrations")
@ApiBearerAuth("integration")
@Controller("integrations/operations")
@UseGuards(IntegrationAuthGuard)
export class IntegrationsOperationsController {
  constructor(private readonly integrationOperations: IntegrationsOperationsService) {}

  @Get("physicians")
  @RequireIntegrationScopes(IntegrationScope.OPERATIONS_READ)
  @ApiOperation({ summary: "List surgeons/physicians for operation booking at a clinic" })
  listPhysicians(@IntegrationClient() client: IntegrationPrincipal, @Query("clinicId") clinicId: string) {
    return this.integrationOperations.listPhysicians(client, clinicId);
  }

  @Get("availability")
  @RequireIntegrationScopes(IntegrationScope.OPERATIONS_READ)
  @ApiOperation({ summary: "Scheduled operations for a clinician (plan external slot picker)" })
  availability(
    @IntegrationClient() client: IntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.integrationOperations.listAvailability(client, clinicId, clinicianId, from, to);
  }

  @Post()
  @RequireIntegrationScopes(IntegrationScope.OPERATIONS_WRITE)
  @ApiOperation({ summary: "Schedule an operation from an external patient platform" })
  book(@IntegrationClient() client: IntegrationPrincipal, @Body() body: IntegrationBookOperationDto) {
    return this.integrationOperations.book(client, body);
  }

  @Get(":id")
  @RequireIntegrationScopes(IntegrationScope.OPERATIONS_READ)
  @ApiOperation({ summary: "Get operation created by this integration client" })
  getOne(@IntegrationClient() client: IntegrationPrincipal, @Param("id") id: string): Promise<OperationDto> {
    return this.integrationOperations.getOne(client, id);
  }

  @Post(":id/cancel")
  @RequireIntegrationScopes(IntegrationScope.OPERATIONS_WRITE)
  @ApiOperation({ summary: "Cancel an integration-scheduled operation" })
  cancel(@IntegrationClient() client: IntegrationPrincipal, @Param("id") id: string): Promise<OperationDto> {
    return this.integrationOperations.cancel(client, id);
  }
}
