import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { OperationDocumentKind, OperationStatus, UserRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateOperationDto } from "./dto/create-operation.dto";
import { OperationDto } from "./dto/operation.dto";
import {
  AddOperationMedicationDto,
  OperationDocumentDto,
  OperationMedicationDto,
} from "./dto/operation-clinical.dto";
import { UpdateOperationDto } from "./dto/update-operation.dto";
import { OperationsService } from "./operations.service";

const UPLOAD_LIMIT = 15 * 1024 * 1024;

const OPERATIONS_VIEW_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.PHYSICIAN,
]);

const OPERATIONS_CREATE_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
]);

const OPERATIONS_STATUS_ROLES: Set<UserRole> = new Set([
  ...OPERATIONS_CREATE_ROLES,
  UserRole.PHYSICIAN,
]);

class PatchOperationStatusDto {
  @ApiProperty({ enum: OperationStatus })
  @IsEnum(OperationStatus)
  status!: OperationStatus;

  @ApiPropertyOptional({
    description: "Amount collected now; required when completing with an outstanding balance",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectionAmount?: number;
}

@ApiTags("operations")
@ApiBearerAuth("bearer")
@Controller("operations")
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  private assertViewAccess(user: JwtUser): void {
    if (!OPERATIONS_VIEW_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to access operations");
    }
  }

  private assertCreateAccess(user: JwtUser): void {
    if (!OPERATIONS_CREATE_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to schedule operations");
    }
  }

  private assertStatusAccess(user: JwtUser): void {
    if (!OPERATIONS_STATUS_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to update operation status");
    }
  }

  @Get()
  @ApiOperation({ summary: "List operations (physicians see only their assigned procedures)" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("clinicId") clinicId?: string,
    @Query("status") status?: string
  ) {
    this.assertViewAccess(user);
    return this.operations.list(requireTenantId(user), user, from, to, page, pageSize, sortBy, sortOrder, clinicId, status);
  }

  @Get("payable")
  @ApiOperation({ summary: "List operations with an outstanding balance (for revenue payments)" })
  @ApiOkResponse({ type: OperationDto, isArray: true })
  listPayable(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    this.assertViewAccess(user);
    return this.operations.listPayable(requireTenantId(user), user, clinicId);
  }

  @Post()
  @ApiOperation({ summary: "Schedule a new operation" })
  @ApiCreatedResponse({ type: OperationDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateOperationDto) {
    this.assertCreateAccess(user);
    return this.operations.create(requireTenantId(user), body, user);
  }

  @Get(":id/documents/:docId/file")
  @ApiOperation({ summary: "Stream operation document (inline display)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getDocumentFile(
    @CurrentUser() user: JwtUser,
    @Param("id") operationId: string,
    @Param("docId") docId: string,
  ): Promise<StreamableFile> {
    this.assertViewAccess(user);
    const meta = await this.operations.getDocumentFileMeta(requireTenantId(user), operationId, docId, user);
    const stream = await this.operations.openDocumentReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Post(":id/documents")
  @ApiOperation({ summary: "Upload attachment or prescription document (multipart: file, kind, optional description)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "kind"],
      properties: {
        file: { type: "string", format: "binary" },
        kind: { type: "string", enum: ["ATTACHMENT", "PRESCRIPTION"] },
        description: { type: "string" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMIT },
    }),
  )
  @ApiCreatedResponse({ type: OperationDocumentDto })
  async uploadDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("kind") kindRaw?: string,
    @Body("description") description?: string,
  ): Promise<OperationDocumentDto> {
    this.assertCreateAccess(user);
    if (!file) throw new BadRequestException("file is required");
    const kind =
      kindRaw === "PRESCRIPTION"
        ? OperationDocumentKind.PRESCRIPTION
        : kindRaw === "ATTACHMENT"
          ? OperationDocumentKind.ATTACHMENT
          : null;
    if (!kind) throw new BadRequestException("kind must be ATTACHMENT or PRESCRIPTION");
    return this.operations.uploadDocument(requireTenantId(user), id, kind, description, file, user);
  }

  @Post(":id/medications")
  @ApiOperation({ summary: "Add medication for this operation" })
  @ApiCreatedResponse({ type: OperationMedicationDto })
  addMedication(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: AddOperationMedicationDto,
  ) {
    this.assertCreateAccess(user);
    return this.operations.addMedication(requireTenantId(user), id, body, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a scheduled operation" })
  @ApiOkResponse({ type: OperationDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateOperationDto) {
    this.assertStatusAccess(user);
    return this.operations.update(requireTenantId(user), id, body, user);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update operation status (completed posts revenue; cancelled voids revenue)" })
  @ApiOkResponse({ type: OperationDto })
  patchStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchOperationStatusDto) {
    this.assertStatusAccess(user);
    return this.operations.updateStatus(requireTenantId(user), id, body.status, user, body.collectionAmount);
  }
}
