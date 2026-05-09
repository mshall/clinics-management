import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { PatientDto } from "../common/dto/patient.dto";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { PatientsService } from "./patients.service";

@ApiTags("patients")
@ApiBearerAuth("bearer")
@Controller("patients")
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({ summary: "List patients with pagination and optional filters" })
  @ApiOkResponse({ description: "{ items: PatientDto[], total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("search") search?: string,
    @Query("mrn") mrn?: string,
    @Query("phone") phone?: string,
    @Query("gender") gender?: string,
    @Query("name") name?: string,
    @Query("nationalId") nationalId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.patients.listPaginated(
      user.tenantId,
      {
        search,
        mrn,
        phone,
        gender,
        name,
        nationalId,
        page,
        pageSize,
        sortBy,
        sortOrder,
      },
      user
    );
  }

  @Post()
  @ApiOperation({ summary: "Register a new patient" })
  @ApiCreatedResponse({ type: PatientDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreatePatientDto) {
    return this.patients.create(user.tenantId, body, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update patient demographics" })
  @ApiOkResponse({ type: PatientDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdatePatientDto) {
    return this.patients.update(user.tenantId, id, body, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get patient by id" })
  @ApiOkResponse({ type: PatientDto })
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.getById(user.tenantId, id, user);
  }
}
