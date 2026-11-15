import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FiscalDeviceKind } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { FiscalDevicesService } from "./fiscal-devices.service";

@ApiTags("fiscal-devices")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FiscalDevicesController {
  constructor(private readonly devices: FiscalDevicesService) {}

  @Get("clinics/:clinicId/fiscal-devices")
  @ApiOperation({ summary: "List fiscal devices for a clinic" })
  list(@CurrentUser() user: JwtUser, @Param("clinicId") clinicId: string) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.listForClinic(user, tenantId, clinicId);
  }

  @Get("clinics/:clinicId/fiscal-devices/setup-status")
  @ApiOperation({ summary: "Whether default receipt device is ready" })
  setupStatus(@CurrentUser() user: JwtUser, @Param("clinicId") clinicId: string) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.clinicSetupStatus(tenantId, clinicId);
  }

  @Post("clinics/:clinicId/fiscal-devices")
  @ApiOperation({ summary: "Create fiscal device (virtual or physical)" })
  create(
    @CurrentUser() user: JwtUser,
    @Param("clinicId") clinicId: string,
    @Body()
    body: {
      kind: FiscalDeviceKind;
      providerKey?: string;
      label?: string;
      serialNumber?: string;
      deviceModel?: string;
      osVersion?: string;
    },
  ) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.createForClinic(user, tenantId, clinicId, body);
  }

  @Patch("fiscal-devices/:id")
  patch(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { label?: string; isDefault?: boolean; status?: string },
  ) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.patch(user, tenantId, id, body);
  }

  @Post("fiscal-devices/:id/credentials")
  @ApiOperation({ summary: "Store device credentials (secrets not returned)" })
  credentials(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body()
    body: {
      clientId: string;
      clientSecret: string;
      baseUrl?: string;
      signingKey?: string;
      extra?: Record<string, unknown>;
    },
  ) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.attachCredentials(user, tenantId, id, body);
  }

  @Post("fiscal-devices/:id/test-connection")
  test(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.testConnection(user, tenantId, id);
  }

  @Delete("fiscal-devices/:id")
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException("Organization context required");
    return this.devices.deactivate(user, tenantId, id);
  }
}