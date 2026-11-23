import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { hasAnyRole } from "../common/effective-roles";
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
import { PatientAllergyDto } from "../common/dto/patient-allergy.dto";
import { PatientDto } from "../common/dto/patient.dto";
import { PatientDocumentDto } from "../common/dto/patient-document.dto";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { BulkDeletePatientsDto } from "./dto/bulk-delete-patients.dto";
import { PatientPhoneConflictDto } from "./dto/patient-phone-conflict.dto";
import { PatientsService } from "./patients.service";
import { Patient360Service } from "./patient-360.service";
import { MessagingConsentService } from "./messaging-consent.service";
import { MessagingConsentItemDto, PutMessagingConsentDto } from "./dto/messaging-consent.dto";
import { ConsentPolicyService } from "../compliance/consent-policy.service";

const PATIENT_DOC_UPLOAD_LIMIT = 25 * 1024 * 1024;

@ApiTags("patients")
@ApiBearerAuth("bearer")
@Controller("patients")
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly patient360: Patient360Service,
    private readonly messagingConsent: MessagingConsentService,
    private readonly consentPolicy: ConsentPolicyService,
  ) {}

  @Get(":id/consents")
  @ApiOperation({ summary: "SC-03 — consent status by purpose (AI, marketplace, messaging, data)" })
  listConsents(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.consentPolicy.listForPatient(requireTenantId(user), id);
  }

  private assertCanManageDuplicates(user: JwtUser): void {
    if (!hasAnyRole(user, [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER])) {
      throw new ForbiddenException("Only organization or clinic administrators may manage duplicate patients");
    }
  }

  @Get("duplicates/summary")
  @ApiOperation({ summary: "Count patient charts that share a phone number with another chart" })
  @ApiOkResponse()
  duplicateSummary(@CurrentUser() user: JwtUser) {
    this.assertCanManageDuplicates(user);
    return this.patient360.phoneDuplicateSummary(requireTenantId(user));
  }

  @Get("duplicates")
  @ApiOperation({ summary: "List phone-number duplicate patient clusters for review and merge" })
  @ApiOkResponse()
  listDuplicates(
    @CurrentUser() user: JwtUser,
    @Query("reason") reason?: "phone" | "nationalId" | "name_dob",
  ) {
    this.assertCanManageDuplicates(user);
    return this.patient360.listDoubleLinkedPatients(requireTenantId(user), {
      reason: reason === "nationalId" || reason === "name_dob" ? reason : "phone",
    });
  }

  @Post("duplicates/merge-safe")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Merge all safe phone duplicate clusters (same phone + compatible names). Keeps the richer chart; moves documents/visits.",
  })
  @ApiOkResponse()
  mergeSafePhoneDuplicates(@CurrentUser() user: JwtUser) {
    this.assertCanManageDuplicates(user);
    return this.patient360.mergeSafePhoneDuplicatePatients(requireTenantId(user), user);
  }

  @Get()
  @ApiOperation({ summary: "List patients with pagination and optional filters" })
  @ApiOkResponse({ description: "{ items: PatientDto[], total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("search") search?: string,
    @Query("id") id?: string,
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
        id,
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

  @Post("bulk-delete")
  @HttpCode(200)
  @ApiOperation({ summary: "Soft-delete multiple patients (group admin, clinic admin, assistant, or branch manager)" })
  @ApiOkResponse({ description: "{ ok: true, deleted: number }" })
  bulkDelete(@CurrentUser() user: JwtUser, @Body() body: BulkDeletePatientsDto) {
    return this.patients.softDeleteMany(requireTenantId(user), body, user);
  }

  @Get("phone-conflict")
  @ApiOperation({ summary: "Check whether a phone number is already registered to another patient" })
  @ApiOkResponse({ type: PatientPhoneConflictDto })
  checkPhoneConflict(
    @CurrentUser() user: JwtUser,
    @Query("phone") phone?: string,
    @Query("excludePatientId") excludePatientId?: string,
  ) {
    return this.patients.checkPhoneConflict(
      requireTenantId(user),
      phone ?? "",
      user,
      excludePatientId?.trim() || undefined,
    );
  }

  @Get(":id/allergies")
  @ApiOperation({ summary: "List patient allergies (paginated, max 5 per page)" })
  @ApiOkResponse({ description: "Paginated PatientAllergyDto" })
  listAllergies(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.patients.listAllergiesPaginated(requireTenantId(user), id, user, page, pageSize);
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
  @ApiOperation({ summary: "Upload optional national ID / SSN scan (PDF or image, max 25MB)" })
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

  @Delete(":id/documents/:documentId")
  @HttpCode(200)
  @ApiOperation({ summary: "Remove a patient-attached document" })
  @ApiOkResponse({ description: "{ ok: true }" })
  removeDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ) {
    return this.patients.removeDocument(requireTenantId(user), id, documentId, user);
  }

  @Delete(":id/encounter-documents/:encounterId/:documentId")
  @HttpCode(200)
  @ApiOperation({ summary: "Remove an encounter document from the patient profile" })
  @ApiOkResponse({ description: "{ ok: true }" })
  removeEncounterDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") patientId: string,
    @Param("encounterId") encounterId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.patients.removeEncounterDocumentForPatient(
      requireTenantId(user),
      patientId,
      encounterId,
      documentId,
      user,
    );
  }

  @Post(":id/documents/:documentId/crop")
  @ApiOperation({ summary: "Crop and replace a patient-attached image document" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        cropX: { type: "number" },
        cropY: { type: "number" },
        cropWidth: { type: "number" },
        cropHeight: { type: "number" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: PATIENT_DOC_UPLOAD_LIMIT },
    }),
  )
  @ApiOkResponse({ description: "{ ok: true, id, originalFileName, mimeType, sizeBytes }" })
  cropDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.patients.cropDocument(requireTenantId(user), id, documentId, user, file);
  }

  @Post(":id/encounter-documents/:encounterId/:documentId/crop")
  @ApiOperation({ summary: "Crop and replace an encounter image document from the patient profile" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        cropX: { type: "number" },
        cropY: { type: "number" },
        cropWidth: { type: "number" },
        cropHeight: { type: "number" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: PATIENT_DOC_UPLOAD_LIMIT },
    }),
  )
  @ApiOkResponse({ description: "{ ok: true, id, originalFileName, mimeType, sizeBytes }" })
  cropEncounterDocument(
    @CurrentUser() user: JwtUser,
    @Param("id") patientId: string,
    @Param("encounterId") encounterId: string,
    @Param("documentId") documentId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.patients.cropEncounterDocumentForPatient(
      requireTenantId(user),
      patientId,
      encounterId,
      documentId,
      user,
      file,
    );
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update patient demographics" })
  @ApiOkResponse({ type: PatientDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdatePatientDto) {
    return this.patients.update(requireTenantId(user), id, body, user);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ summary: "Soft-delete a patient (group admin, clinic admin, assistant, or branch manager)" })
  @ApiOkResponse({ description: "{ ok: true }" })
  delete(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.softDelete(requireTenantId(user), id, user);
  }

  @Get(":id/clinical-documents")
  @ApiOperation({ summary: "List lab, radiology, prescription, and other documents for a patient" })
  @ApiOkResponse({ description: "Grouped clinical documents from registration and encounters" })
  listClinicalDocuments(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.listClinicalDocuments(requireTenantId(user), id, user);
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Patient 360 one-page summary" })
  summary(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patient360.getSummary(requireTenantId(user), id);
  }

  @Get(":id/timeline")
  @ApiOperation({ summary: "Unified patient timeline" })
  timeline(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("types") types?: string,
    @Query("limit") limit?: string,
  ) {
    return this.patient360.getTimeline(requireTenantId(user), user, id, types, limit ? Number(limit) : 80);
  }

  @Get(":id/active-problems")
  activeProblems(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patient360.listActiveProblems(requireTenantId(user), id);
  }

  @Post(":id/active-problems")
  saveActiveProblem(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.patient360.upsertActiveProblem(requireTenantId(user), id, body as never);
  }

  @Get(":id/family-links")
  familyLinks(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patient360.listFamilyLinks(requireTenantId(user), id);
  }

  @Post(":id/family-links")
  addFamilyLink(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.patient360.addFamilyLink(requireTenantId(user), id, body as never);
  }

  @Delete(":id/family-links/:linkId")
  removeFamilyLink(@CurrentUser() user: JwtUser, @Param("linkId") linkId: string) {
    return this.patient360.removeFamilyLink(requireTenantId(user), linkId);
  }

  @Post(":id/merge")
  mergePatients(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body()
    body: {
      sourcePatientId: string;
      fieldChoices?: Record<string, "target" | "source">;
    },
  ) {
    return this.patient360.mergePatients(
      requireTenantId(user),
      user,
      id,
      body.sourcePatientId,
      body.fieldChoices,
    );
  }

  @Get(":id/clinical-photos")
  clinicalPhotos(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patient360.listClinicalPhotos(requireTenantId(user), id);
  }

  @Get(":id/clinical-photos/:photoId/file")
  @ApiOperation({ summary: "Download a clinical comparison photo" })
  @ApiOkResponse({ description: "Binary image stream" })
  async getClinicalPhotoFile(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
  ): Promise<StreamableFile> {
    const meta = await this.patients.getClinicalPhotoMeta(requireTenantId(user), id, photoId);
    const stream = await this.patients.openDocumentReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Get(":id/messaging-consent")
  @ApiOperation({ summary: "MS-03 — messaging consent by channel and purpose" })
  @ApiOkResponse({ type: [MessagingConsentItemDto] })
  getMessagingConsent(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.messagingConsent.listForPatient(requireTenantId(user), id);
  }

  @Put(":id/messaging-consent")
  @ApiOperation({ summary: "MS-03 — update messaging consent toggles" })
  @ApiOkResponse({ type: [MessagingConsentItemDto] })
  putMessagingConsent(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: PutMessagingConsentDto,
  ) {
    return this.messagingConsent.putForPatient(requireTenantId(user), id, user.userId, body);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get patient by id" })
  @ApiOkResponse({ type: PatientDto })
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.patients.getById(requireTenantId(user), id, user);
  }
}
