import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PatientDto } from "../common/dto/patient.dto";
import { PatientDocumentDto } from "../common/dto/patient-document.dto";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { PatientsService } from "./patients.service";

const PATIENT_DOC_UPLOAD_LIMIT = 15 * 1024 * 1024;

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
      requireTenantId(user),
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
    return this.patients.create(requireTenantId(user), body, user);
  }

  @Get(":id/national-id-document")
  @ApiOperation({ summary: "Download optional national ID / SSN scan (if uploaded)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getNationalIdDocument(@CurrentUser() user: JwtUser, @Param("id") id: string): Promise<StreamableFile> {
    const meta = await this.patients.getNationalIdDocumentMeta(requireTenantId(user), id, user);
    const stream = await this.patients.openNationalIdDocumentReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Post(":id/national-id-document")
  @ApiOperation({ summary: "Upload optional national ID / SSN scan (PDF or image, max 15MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "National ID / SSN scan" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: PATIENT_DOC_UPLOAD_LIMIT },
    })
  )
  @ApiOkResponse({ type: PatientDto })
  uploadNationalIdDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.patients.attachNationalIdDocument(requireTenantId(user), id, user, file);
  }

  @Post(":id/documents")
  @ApiOperation({ summary: "Attach a document with description to patient record" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        description: { type: "string", description: "Required description for this document" },
      },
      required: ["file", "description"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: PATIENT_DOC_UPLOAD_LIMIT },
    }),
  )
  @ApiCreatedResponse({ type: PatientDocumentDto })
  uploadDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body("description") description: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.patients.attachDocument(requireTenantId(user), id, user, description, file);
  }

  @Get(":id/documents/:documentId")
  @ApiOperation({ summary: "Download a patient-attached document" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ): Promise<StreamableFile> {
    const meta = await this.patients.getDocumentMeta(requireTenantId(user), id, documentId, user);
    const stream = await this.patients.openDocumentReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update patient demographics" })
  @ApiOkResponse({ type: PatientDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdatePatientDto) {
    return this.patients.update(requireTenantId(user), id, body, user);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ summary: "Soft-delete a patient (group admin only)" })
  @ApiOkResponse({ description: "{ ok: true }" })
  delete(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.softDelete(requireTenantId(user), id, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get patient by id" })
  @ApiOkResponse({ type: PatientDto })
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.getById(requireTenantId(user), id, user);
  }
}
