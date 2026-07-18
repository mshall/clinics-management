import { Body, Controller, Delete, Get, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { LeaveStatus } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IsEnum } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateAttendanceDto } from "./dto/create-attendance.dto";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import { AttendanceDto } from "./dto/attendance.dto";
import { EmployeeDto } from "./dto/employee.dto";
import { LeaveRequestDto } from "./dto/leave-request.dto";
import { UnlinkedUserDto } from "./dto/unlinked-user.dto";
import { DeactivateEmployeeDto } from "./dto/deactivate-employee.dto";
import { ReactivateEmployeeDto } from "./dto/reactivate-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { HrService } from "./hr.service";

const ID_DOC_UPLOAD_LIMIT = 15 * 1024 * 1024;

class PatchLeaveStatusDto {
  @ApiProperty({ enum: LeaveStatus })
  @IsEnum(LeaveStatus)
  status!: LeaveStatus;
}

@ApiTags("hr")
@ApiBearerAuth("bearer")
@Controller("hr")
@UseGuards(JwtAuthGuard)
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get("summary")
  @ApiOperation({ summary: "HR KPIs: headcount, payroll estimate, pending leave" })
  @ApiOkResponse()
  summary(@CurrentUser() user: JwtUser) {
    return this.hr.hrSummary(requireTenantId(user));
  }

  @Get("employees")
  @ApiOperation({ summary: "List employees" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  listEmployees(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("clinicId") clinicId?: string,
    @Query("nameFilter") nameFilter?: string,
    @Query("clinicFilter") clinicFilter?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("recordStatus") recordStatus?: string,
    @Query("archived") archived?: string,
  ) {
    return this.hr.listEmployees(requireTenantId(user), user, page, pageSize, search, clinicId, nameFilter, clinicFilter, sortBy, sortOrder, recordStatus, archived);
  }

  @Get("unlinked-users")
  @ApiOperation({ summary: "List organization login accounts not yet linked to an employee" })
  @ApiOkResponse({ type: [UnlinkedUserDto] })
  listUnlinkedUsers(@CurrentUser() user: JwtUser, @Query("search") search?: string) {
    return this.hr.listUnlinkedUsers(requireTenantId(user), user, search);
  }

  @Get("employees/:id/avatar")
  @ApiOperation({ summary: "Download linked login account profile picture (if any)" })
  @ApiOkResponse({ description: "Binary image stream" })
  async getEmployeeUserAvatar(@CurrentUser() user: JwtUser, @Param("id") id: string): Promise<StreamableFile> {
    const meta = await this.hr.getEmployeeUserAvatarMeta(requireTenantId(user), id, user);
    const stream = await this.hr.openEmployeeUserAvatarReadStream(meta.storageKey);
    return new StreamableFile(stream, { type: meta.mimeType });
  }

  @Get("employees/:id/id-document")
  @ApiOperation({ summary: "Download employee ID / passport attachment (if any)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getEmployeeIdDocument(@CurrentUser() user: JwtUser, @Param("id") id: string): Promise<StreamableFile> {
    const meta = await this.hr.getEmployeeIdDocumentMeta(requireTenantId(user), id, user);
    const stream = await this.hr.openEmployeeIdDocumentReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Get("employees/:id")
  @ApiOperation({ summary: "Get employee by id" })
  @ApiOkResponse({ type: EmployeeDto })
  getEmployee(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.hr.getEmployee(requireTenantId(user), id, user);
  }

  @Post("employees")
  @ApiOperation({ summary: "Hire / register employee" })
  @ApiCreatedResponse({ type: EmployeeDto })
  createEmployee(@CurrentUser() user: JwtUser, @Body() body: CreateEmployeeDto) {
    return this.hr.createEmployee(requireTenantId(user), body, user);
  }

  @Patch("employees/:id")
  @ApiOperation({ summary: "Update employee (HR, group admin, clinic admin, branch manager)" })
  @ApiOkResponse({ type: EmployeeDto })
  updateEmployee(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateEmployeeDto) {
    return this.hr.updateEmployee(requireTenantId(user), id, body, user);
  }

  @Delete("employees/:id")
  @ApiOperation({ summary: "Archive employee and linked user (soft delete)" })
  @ApiOkResponse({ description: "{ ok: true, id, archived: true }" })
  removeEmployee(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.hr.deleteEmployee(requireTenantId(user), id, user);
  }

  @Post("employees/:id/restore")
  @ApiOperation({ summary: "Restore an archived employee and linked user" })
  @ApiOkResponse({ type: EmployeeDto })
  restoreEmployee(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: ReactivateEmployeeDto,
  ) {
    return this.hr.restoreEmployeeRecord(requireTenantId(user), id, body, user);
  }

  @Post("employees/:id/deactivate")
  @ApiOperation({ summary: "Deactivate employee (resignation)" })
  @ApiOkResponse({ type: EmployeeDto })
  deactivateEmployee(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: DeactivateEmployeeDto,
  ) {
    return this.hr.deactivateEmployee(requireTenantId(user), id, body, user);
  }

  @Post("employees/:id/reactivate")
  @ApiOperation({ summary: "Reactivate a previously deactivated employee" })
  @ApiOkResponse({ type: EmployeeDto })
  reactivateEmployee(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: ReactivateEmployeeDto,
  ) {
    return this.hr.reactivateEmployee(requireTenantId(user), id, body, user);
  }

  @Post("employees/:id/id-document")
  @ApiOperation({ summary: "Upload ID or passport (PDF or image, max 15MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "ID or passport scan" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: ID_DOC_UPLOAD_LIMIT },
    })
  )
  @ApiOkResponse({ type: EmployeeDto })
  uploadEmployeeIdDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.hr.attachEmployeeIdDocument(requireTenantId(user), id, user, file);
  }

  @Get("attendance")
  @ApiOperation({ summary: "List attendance records" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  listAttendance(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("employeeId") employeeId?: string,
    @Query("workDateFrom") workDateFrom?: string,
    @Query("workDateTo") workDateTo?: string,
    @Query("status") status?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.hr.listAttendance(requireTenantId(user), page, pageSize, employeeId, workDateFrom, workDateTo, status, sortBy, sortOrder);
  }

  @Post("attendance")
  @ApiOperation({ summary: "Clock attendance" })
  @ApiCreatedResponse({ type: AttendanceDto })
  createAttendance(@CurrentUser() user: JwtUser, @Body() body: CreateAttendanceDto) {
    return this.hr.createAttendance(requireTenantId(user), body);
  }

  @Get("leave-requests")
  @ApiOperation({ summary: "List leave requests" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  listLeave(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("employeeId") employeeId?: string,
    @Query("status") status?: string,
    @Query("startFrom") startFrom?: string,
    @Query("startTo") startTo?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.hr.listLeaveRequests(requireTenantId(user), page, pageSize, employeeId, status, startFrom, startTo, sortBy, sortOrder);
  }

  @Post("leave-requests")
  @ApiOperation({ summary: "Submit leave request" })
  @ApiCreatedResponse({ type: LeaveRequestDto })
  createLeave(@CurrentUser() user: JwtUser, @Body() body: CreateLeaveRequestDto) {
    return this.hr.createLeaveRequest(requireTenantId(user), body);
  }

  @Patch("leave-requests/:id/status")
  @ApiOperation({ summary: "Approve or reject leave" })
  @ApiOkResponse({ type: LeaveRequestDto })
  patchLeaveStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchLeaveStatusDto) {
    return this.hr.updateLeaveStatus(requireTenantId(user), id, body.status);
  }
}
