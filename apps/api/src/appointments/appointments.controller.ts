import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { AppointmentStatus } from "@prisma/client";
import { IsEnum } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { AppointmentsService } from "./appointments.service";
import { AppointmentDto } from "./dto/appointment.dto";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { UpdateAppointmentDto } from "./dto/update-appointment.dto";

class PatchAppointmentStatusDto {
  @ApiProperty({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}

@ApiTags("appointments")
@ApiBearerAuth("bearer")
@Controller("appointments")
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: "List appointments" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("patientMrn") patientMrn?: string,
    @Query("patientSearch") patientSearch?: string,
    @Query("patientId") patientId?: string,
    @Query("status") status?: string,
    @Query("clinicId") clinicId?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("bookableOnly") bookableOnly?: string
  ) {
    return this.appointments.list(
      user.tenantId,
      page,
      pageSize,
      from,
      to,
      patientMrn,
      patientSearch,
      patientId,
      status,
      clinicId,
      sortBy,
      sortOrder,
      bookableOnly
    );
  }

  @Post()
  @ApiOperation({ summary: "Book appointment" })
  @ApiCreatedResponse({ type: AppointmentDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateAppointmentDto) {
    return this.appointments.create(user.tenantId, body);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get appointment by id" })
  @ApiOkResponse({ type: AppointmentDto })
  getOne(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.appointments.getById(user.tenantId, id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update appointment status" })
  @ApiOkResponse({ type: AppointmentDto })
  patchStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchAppointmentStatusDto) {
    return this.appointments.updateStatus(user.tenantId, id, body.status);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update appointment (not allowed when completed or cancelled)" })
  @ApiOkResponse({ type: AppointmentDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateAppointmentDto) {
    return this.appointments.update(user.tenantId, id, body);
  }
}
