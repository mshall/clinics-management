import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  ApiTags,
} from "@nestjs/swagger";
import { EncounterDocumentKind } from "@prisma/client";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { AddDiagnosisDto } from "./dto/add-diagnosis.dto";
import { AddEncounterMedicationDto } from "./dto/add-encounter-medication.dto";
import { CreateEncounterDto } from "./dto/create-encounter.dto";
import { DiagnosisDto, EncounterDetailDto, EncounterDocumentDto, EncounterMedicationDto } from "./dto/encounter-response.dto";
import { UpdateEncounterDto } from "./dto/update-encounter.dto";
import { EncountersService } from "./encounters.service";

const UPLOAD_LIMIT = 15 * 1024 * 1024;

@ApiTags("encounters")
@ApiBearerAuth("bearer")
@Controller("encounters")
@UseGuards(JwtAuthGuard)
export class EncountersController {
  constructor(private readonly encounters: EncountersService) {}

  @Get()
  @ApiOperation({ summary: "List encounters (optional patientId, paginated)" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("patientId") patientId?: string,
    @Query("patientSearch") patientSearch?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.encounters.listForTenant(
      user.tenantId,
      patientId,
      patientSearch,
      from,
      to,
      page,
      pageSize,
      sortBy,
      sortOrder,
      user
    );
  }

  @Post()
  @ApiOperation({ summary: "Create draft encounter for a patient" })
  @ApiCreatedResponse({ type: EncounterDetailDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateEncounterDto) {
    return this.encounters.create(user.tenantId, user, body);
  }

  @Get(":id/documents/:docId/file")
  @ApiOperation({ summary: "Stream encounter document (inline display)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getDocumentFile(
    @CurrentUser() user: JwtUser,
    @Param("id") encounterId: string,
    @Param("docId") docId: string
  ): Promise<StreamableFile> {
    const meta = await this.encounters.getDocumentAbsolutePath(user.tenantId, encounterId, docId, user);
    const stream = this.encounters.getDocumentReadStream(meta.absolutePath);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get encounter with diagnoses, medications, documents" })
  @ApiOkResponse({ type: EncounterDetailDto })
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.encounters.getById(user.tenantId, id, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update SOAP / vitals / no-medications (draft only)" })
  @ApiOkResponse({ type: EncounterDetailDto })
  patch(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateEncounterDto) {
    return this.encounters.update(user.tenantId, id, body, user);
  }

  @Post(":id/documents")
  @ApiOperation({ summary: "Upload lab or radiology document (multipart field: file, kind=LAB|RADIOLOGY)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "kind"],
      properties: {
        file: { type: "string", format: "binary" },
        kind: { type: "string", enum: ["LAB", "RADIOLOGY"] },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMIT },
    })
  )
  @ApiCreatedResponse({ type: EncounterDocumentDto })
  async uploadDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("kind") kindRaw?: string
  ): Promise<EncounterDocumentDto> {
    if (!file) throw new BadRequestException("file is required");
    const kind =
      kindRaw === "RADIOLOGY"
        ? EncounterDocumentKind.RADIOLOGY
        : kindRaw === "LAB"
          ? EncounterDocumentKind.LAB
          : null;
    if (!kind) throw new BadRequestException("kind must be LAB or RADIOLOGY");
    return this.encounters.uploadDocument(user.tenantId, id, kind, file, user);
  }

  @Delete(":id/documents/:docId")
  @ApiOperation({ summary: "Remove document (draft only)" })
  @ApiOkResponse({ description: "{ ok: true }" })
  async removeDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") encounterId: string,
    @Param("docId") docId: string
  ) {
    await this.encounters.removeDocument(user.tenantId, encounterId, docId, user);
    return { ok: true };
  }

  @Post(":id/medications")
  @ApiOperation({ summary: "Add prescribed medication" })
  @ApiCreatedResponse({ type: EncounterMedicationDto })
  addMedication(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: AddEncounterMedicationDto
  ) {
    return this.encounters.addMedication(user.tenantId, id, body, user);
  }

  @Delete(":id/medications/:medicationId")
  @ApiOperation({ summary: "Remove medication (draft only)" })
  @ApiOkResponse({ description: "{ ok: true }" })
  async removeMedication(
    @CurrentUser() user: JwtUser,
    @Param("id") encounterId: string,
    @Param("medicationId") medicationId: string
  ) {
    await this.encounters.removeMedication(user.tenantId, encounterId, medicationId, user);
    return { ok: true };
  }

  @Post(":id/diagnoses")
  @ApiOperation({ summary: "Add ICD-10 diagnosis to encounter" })
  @ApiCreatedResponse({ type: DiagnosisDto })
  addDiagnosis(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: AddDiagnosisDto) {
    return this.encounters.addDiagnosis(user.tenantId, id, body, user);
  }

  @Delete(":id/diagnoses/:diagnosisId")
  @ApiOperation({ summary: "Remove diagnosis (draft only)" })
  @ApiOkResponse({ description: "No content" })
  async removeDiagnosis(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("diagnosisId") diagnosisId: string
  ) {
    await this.encounters.removeDiagnosis(user.tenantId, id, diagnosisId, user);
    return { ok: true };
  }

  @Post(":id/finalize")
  @ApiOperation({ summary: "Finalize encounter (clinician only; diagnoses + medications policy)" })
  @ApiOkResponse({ type: EncounterDetailDto })
  finalize(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.encounters.finalize(user.tenantId, user.userId, id);
  }
}
