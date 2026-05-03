import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicDto } from "../common/dto/clinic.dto";
import { CreateClinicDto } from "./dto/create-clinic.dto";
import { ClinicsService } from "./clinics.service";

@ApiTags("clinics")
@ApiBearerAuth("bearer")
@Controller("clinics")
@UseGuards(JwtAuthGuard)
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: "List clinics and branches for the tenant" })
  @ApiOkResponse({ type: ClinicDto, isArray: true })
  list(@CurrentUser() user: JwtUser) {
    return this.clinics.list(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: "Create a parent clinic or a branch under a parent" })
  @ApiCreatedResponse({ description: "ClinicDto" })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateClinicDto) {
    return this.clinics.create(user.tenantId, body);
  }
}
