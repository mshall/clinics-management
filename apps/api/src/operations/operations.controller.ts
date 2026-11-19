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
import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequiresScope, ScopeGuard } from "../scope-of-practice/scope-of-practice-public";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateOperationDto } from "./dto/create-operation.dto";
import { OperationDto } from "./dto/operation.dto";
import { OperationDetailDto } from "./dto/operation-detail.dto";
import {
  AddOperationMedicationDto,
  OperationDocumentDto,
  OperationMedicationDto,
} from "./dto/operation-clinical.dto";
import { UpdateOperationDto } from "./dto/update-operation.dto";
import { assertCanCompleteOperation } from "./operation-complete-roles";
import { OperationsService } from "./operations.service";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";

const UPLOAD_LIMIT = 15 * 1024 * 1024;

const OPERATIONS_VIEW_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
  UserRole.PHYSICIAN,
  UserRole.FINANCE_OFFICER,
]);

const OPERATIONS_CREATE_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
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

  @ApiPropertyOptional({
    description: "When true, allows advancing multiple pipeline stages in one update (client must confirm with the user)",
  })
  @IsOptional()
  @IsBoolean()
  allowPipelineSkip?: boolean;
}

@ApiTags("operations")
@ApiBearerAuth("bearer")
@Controller("operations")
@UseGuards(JwtAuthGuard, EntitlementGuard, ScopeGuard)
@RequiresEntitlement("mod_operations")
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly navTabAccess: NavTabAccessService,
  ) {}

  private async assertViewAccess(user: JwtUser): Promise<void> {
    await this.navTabAccess.assertViewTab(
      user,
      "operations",
      OPERATIONS_VIEW_ROLES,
      "You do not have permission to access operations",
    );
  }

  private async assertCreateAccess(user: JwtUser): Promise<void> {
    await this.navTabAccess.assertMutateTab(
      user,
      "operations",
      OPERATIONS_CREATE_ROLES,
      "You do not have permission to schedule operations",
    );
  }

  private async assertStatusAccess(user: JwtUser): Promise<void> {
    await this.navTabAccess.assertMutateTab(
      user,
      "operations",
      OPERATIONS_STATUS_ROLES,
      "You do not have permission to update operation status",
    );
  }

  @Get()
  @ApiOperation({ summary: "List operations (physicians see only their assigned procedures)" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  async list(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("clinicId") clinicId?: string,
    @Query("status") status?: string,
    @Query("patientId") patientId?: string,
  ) {
    await this.assertViewAccess(user);
    return this.operations.list(
      requireTenantId(user),
      user,
      from,
      to,
      page,
      pageSize,
      sortBy,
      sortOrder,
      clinicId,
      status,
      patientId,
    );
  }

  @Get("summary")
  @ApiOperation({ summary: "Aggregate operation counts and revenue for the reporting window" })
  @ApiOkResponse()
  async summary(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await this.assertViewAccess(user);
    return this.operations.summary(requireTenantId(user), user, from, to, clinicId);
  }

  @Get("payable")
  @ApiOperation({ summary: "List operations with an outstanding balance (for revenue payments)" })
  @ApiOkResponse({ type: OperationDto, isArray: true })
  async listPayable(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    await this.assertViewAccess(user);
    return this.operations.listPayable(requireTenantId(user), user, clinicId);
  }

  @Post()
  @ApiOperation({ summary: "Schedule a new operation" })
  @ApiCreatedResponse({ type: OperationDto })
  async create(@CurrentUser() user: JwtUser, @Body() body: CreateOperationDto) {
    await this.assertCreateAccess(user);
    return this.operations.create(requireTenantId(user), body, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get operation with medications and documents" })
  @ApiOkResponse({ type: OperationDetailDto })
  async getOne(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    await this.assertViewAccess(user);
    return this.operations.getOne(requireTenantId(user), id, user);
  }

  @Get(":id/documents/:docId/file")
  @ApiOperation({ summary: "Stream operation document (inline display)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getDocumentFile(
    @CurrentUser() user: JwtUser,
    @Param("id") operationId: string,
    @Param("docId") docId: string,
  ): Promise<StreamableFile> {
    await this.assertViewAccess(user);
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
    await this.assertCreateAccess(user);
    if (!file) throw new BadRequestException("file is required");
    const normalized = kindRaw?.trim().toUpperCase();
    const kind =
      normalized === "PRESCRIPTION"
        ? OperationDocumentKind.PRESCRIPTION
        : normalized === "ATTACHMENT"
          ? OperationDocumentKind.ATTACHMENT
          : normalized === "POST_SURGERY"
            ? OperationDocumentKind.POST_SURGERY
            : null;
    if (!kind) {
      throw new BadRequestException("kind must be ATTACHMENT, PRESCRIPTION, or POST_SURGERY");
    }
    return this.operations.uploadDocument(requireTenantId(user), id, kind, description, file, user);
  }

  @RequiresScope("rx.prescribe")
  @Post(":id/medications")
  @ApiOperation({ summary: "Add medication for this operation" })
  @ApiCreatedResponse({ type: OperationMedicationDto })
  async addMedication(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: AddOperationMedicationDto,
  ) {
    await this.assertCreateAccess(user);
    return this.operations.addMedication(requireTenantId(user), id, body, user);
  }

  @RequiresScope("rx.prescribe")
  @Post(":id/reset-clinical")
  @ApiOperation({ summary: "Clear medications and optionally prescription documents (scheduled operations only)" })
  @ApiOkResponse({ description: "Clinical data cleared" })
  async resetClinical(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body?: { clearPrescription?: boolean },
  ) {
    await this.assertCreateAccess(user);
    return this.operations.resetClinical(requireTenantId(user), id, user, body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a scheduled operation, or correct a completed operation (admin only)" })
  @ApiOkResponse({ type: OperationDto })
  async update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateOperationDto) {
    await this.assertStatusAccess(user);
    return this.operations.update(requireTenantId(user), id, body, user);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update operation status (completed posts revenue; cancelled voids revenue)" })
  @ApiOkResponse({ type: OperationDto })
  async patchStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchOperationStatusDto) {
    await this.assertStatusAccess(user);
    assertCanCompleteOperation(user, body.status);
    return this.operations.updateStatus(requireTenantId(user), id, body.status, user, body.collectionAmount, {
      allowPipelineSkip: body.allowPipelineSkip === true,
    });
  }

  @Get(":id/pre-op-checklist")
  async preOpList(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    await this.assertViewAccess(user);
    return this.operations.ensurePreOpChecklist(requireTenantId(user), id);
  }

  @Post(":id/pre-op-checklist/:itemId/complete")
  preOpComplete(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("itemId") itemId: string) {
    return this.operations.completePreOpItem(requireTenantId(user), id, itemId, user.userId);
  }

  @Post(":id/supplies")
  async addSupply(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { itemName: string; quantity?: number; unit?: string; catalogCode?: string },
  ) {
    await this.assertCreateAccess(user);
    return this.operations.addSupply(requireTenantId(user), id, body);
  }

  @Post(":id/installments")
  async setInstallments(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { rows: { dueOn: string; amount: number }[] },
  ) {
    await this.assertStatusAccess(user);
    return this.operations.setInstallments(requireTenantId(user), id, body.rows ?? []);
  }

  @Patch(":id/operation-note")
  async saveNote(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    await this.assertCreateAccess(user);
    return this.operations.saveOperationNote(requireTenantId(user), id, body);
  }
}
