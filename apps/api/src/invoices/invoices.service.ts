import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "crypto";
import * as path from "path";
import type { JwtUser } from "../auth/jwt-user";
import { CLINIC_SCOPE_ROLES, fetchClinicScopeIds, fetchPhysicianNetworkClinicIds } from "../common/clinic-scope";
import { resolveClinicCurrency } from "../common/clinic-currency";
import {
  invoiceBackgroundHex,
  isInvoiceBackgroundColorId,
  normalizeInvoiceSections,
} from "../common/invoice-config";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import type { CreateInvoiceDto } from "./dto/create-invoice.dto";
import type { InvoiceDto, InvoiceListItemDto } from "./dto/invoice.dto";

const invoiceInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function isPhysicianRole(role: UserRole | undefined): boolean {
  return role === UserRole.PHYSICIAN || String(role) === "PHYSICIAN";
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private mapInvoice(row: InvoiceRow): InvoiceDto {
    const lines = row.lines.map((l) => ({
      id: l.id,
      purpose: l.purpose,
      amountPaid: Number(l.amountPaid),
      sortOrder: l.sortOrder,
    }));
    const totalAmount = lines.reduce((sum, l) => sum + l.amountPaid, 0);
    return {
      id: row.id,
      clinicId: row.clinicId,
      patientId: row.patientId,
      encounterId: row.encounterId,
      operationId: row.operationId,
      invoiceNumber: row.invoiceNumber,
      issueDate: row.issueDate.toISOString(),
      currency: row.currency,
      backgroundColor: row.backgroundColor,
      sections: normalizeInvoiceSections(row.sectionsSnapshot),
      patientName: row.patientName,
      patientMrn: row.patientMrn,
      clinicNameEn: row.clinicNameEn,
      clinicNameAr: row.clinicNameAr,
      clinicAddressEn: row.clinicAddressEn,
      clinicAddressAr: row.clinicAddressAr,
      clinicPhone: row.clinicPhone,
      clinicEmail: row.clinicEmail,
      clinicLicenseNumber: row.clinicLicenseNumber,
      totalAmount,
      lines,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapListItem(row: InvoiceRow): InvoiceListItemDto {
    const totalAmount = row.lines.reduce((sum, l) => sum + Number(l.amountPaid), 0);
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      issueDate: row.issueDate.toISOString(),
      currency: row.currency,
      totalAmount,
      encounterId: row.encounterId,
      operationId: row.operationId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async assertPatientVisible(tenantId: string, patientId: string, viewer: JwtUser): Promise<void> {
    const row = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Patient not found");
    if (viewer.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.length) throw new NotFoundException("Patient not found");
    }
  }

  private async assertEncounterInvoiceAccess(
    tenantId: string,
    encounter: { clinicianId: string; clinicId: string },
    viewer: JwtUser,
  ): Promise<void> {
    if (isPhysicianRole(viewer.role) && encounter.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only generate invoices for encounters assigned to you");
    }
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
    if (scopeIds !== null && !scopeIds.includes(encounter.clinicId)) {
      throw new ForbiddenException("This encounter is outside your assigned clinics");
    }
  }

  private async assertOperationInvoiceAccess(
    tenantId: string,
    operation: { clinicianId: string; clinicId: string },
    viewer: JwtUser,
  ): Promise<void> {
    if (isPhysicianRole(viewer.role) && operation.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only generate invoices for operations assigned to you");
    }
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
    if (scopeIds !== null && !scopeIds.includes(operation.clinicId)) {
      throw new ForbiddenException("This operation is outside your assigned clinics");
    }
  }

  private async nextInvoiceNumber(clinicId: string, issueDate: Date): Promise<string> {
    const year = issueDate.getFullYear();
    const prefix = `INV-${year}-`;
    const latest = await this.prisma.invoice.findFirst({
      where: { clinicId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let seq = 1;
    if (latest?.invoiceNumber) {
      const tail = latest.invoiceNumber.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed)) seq = parsed + 1;
    }
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }

  async create(tenantId: string, dto: CreateInvoiceDto, viewer: JwtUser): Promise<InvoiceDto> {
    const hasEncounter = Boolean(dto.encounterId?.trim());
    const hasOperation = Boolean(dto.operationId?.trim());
    if (hasEncounter === hasOperation) {
      throw new BadRequestException("Provide exactly one of encounterId or operationId");
    }

    const lines = dto.lines.map((l, idx) => ({
      purpose: l.purpose.trim(),
      amountPaid: new Prisma.Decimal(String(l.amountPaid)),
      sortOrder: idx,
    }));
    if (lines.some((l) => !l.purpose)) {
      throw new BadRequestException("Each line must have a purpose");
    }

    let clinicId: string;
    let patientId: string;
    let patientName: string;
    let patientMrn: string | null;
    let encounterId: string | null = null;
    let operationId: string | null = null;

    if (dto.encounterId) {
      const enc = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        include: { patient: true, clinic: true },
      });
      if (!enc) throw new NotFoundException("Encounter not found");
      await this.assertEncounterInvoiceAccess(tenantId, enc, viewer);
      clinicId = enc.clinicId;
      patientId = enc.patientId;
      patientName = `${enc.patient.firstNameEn} ${enc.patient.lastNameEn}`.trim();
      patientMrn = enc.patient.mrn;
      encounterId = enc.id;
    } else {
      const op = await this.prisma.operation.findFirst({
        where: { id: dto.operationId!, tenantId },
        include: { patient: true, clinic: true },
      });
      if (!op) throw new NotFoundException("Operation not found");
      await this.assertOperationInvoiceAccess(tenantId, op, viewer);
      clinicId = op.clinicId;
      patientId = op.patientId;
      patientName = `${op.patient.firstNameEn} ${op.patient.lastNameEn}`.trim();
      patientMrn = op.patient.mrn;
      operationId = op.id;
    }

    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const issueDate = new Date();
    const invoiceNumber = await this.nextInvoiceNumber(clinicId, issueDate);
    const currency = await resolveClinicCurrency(this.prisma, tenantId, clinicId);
    const backgroundColor = clinic.invoiceBackgroundColor || "white";
    const sections = normalizeInvoiceSections(clinic.invoiceSections);

    const row = await this.prisma.invoice.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        encounterId,
        operationId,
        invoiceNumber,
        issueDate,
        currency,
        backgroundColor,
        sectionsSnapshot: sections as unknown as Prisma.InputJsonValue,
        patientName,
        patientMrn,
        clinicNameEn: clinic.nameEn,
        clinicNameAr: clinic.nameAr,
        clinicAddressEn: clinic.addressEn,
        clinicAddressAr: clinic.addressAr,
        clinicPhone: clinic.phone,
        clinicEmail: clinic.email,
        clinicLicenseNumber: clinic.licenseNumber,
        createdByUserId: viewer.userId,
        lines: { create: lines },
      },
      include: invoiceInclude,
    });

    return this.mapInvoice(row);
  }

  async list(
    tenantId: string,
    viewer: JwtUser,
    filters: { patientId?: string; encounterId?: string; operationId?: string },
  ): Promise<InvoiceListItemDto[]> {
    const where: Prisma.InvoiceWhereInput = { tenantId };

    if (filters.patientId) {
      await this.assertPatientVisible(tenantId, filters.patientId, viewer);
      where.patientId = filters.patientId;
    }
    if (filters.encounterId) where.encounterId = filters.encounterId;
    if (filters.operationId) where.operationId = filters.operationId;

    if (CLINIC_SCOPE_ROLES.has(viewer.role)) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
      if (scopeIds !== null) {
        if (!scopeIds.length) return [];
        where.clinicId = { in: scopeIds };
      }
    } else if (isPhysicianRole(viewer.role)) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.length) return [];
      where.clinicId = { in: net };
      if (!filters.patientId && !filters.encounterId && !filters.operationId) {
        where.OR = [{ encounter: { clinicianId: viewer.userId } }, { operation: { clinicianId: viewer.userId } }];
      }
    }

    const rows = await this.prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => this.mapListItem(r));
  }

  async getOne(tenantId: string, id: string, viewer: JwtUser): Promise<InvoiceDto> {
    const row = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: invoiceInclude,
    });
    if (!row) throw new NotFoundException("Invoice not found");

    if (CLINIC_SCOPE_ROLES.has(viewer.role)) {
      const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, viewer);
      if (scopeIds !== null && !scopeIds.includes(row.clinicId)) {
        throw new NotFoundException("Invoice not found");
      }
    } else if (isPhysicianRole(viewer.role)) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.includes(row.clinicId)) throw new NotFoundException("Invoice not found");
      const ownsEncounter = row.encounterId
        ? await this.prisma.encounter.findFirst({
            where: { id: row.encounterId, clinicianId: viewer.userId },
            select: { id: true },
          })
        : null;
      const ownsOperation = row.operationId
        ? await this.prisma.operation.findFirst({
            where: { id: row.operationId, clinicianId: viewer.userId },
            select: { id: true },
          })
        : null;
      if (!ownsEncounter && !ownsOperation) throw new NotFoundException("Invoice not found");
    }

    return this.mapInvoice(row);
  }

  async getClinicInvoiceLogoMeta(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, false);
    const row = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: {
        invoiceLogoRelativePath: true,
        invoiceLogoOriginalName: true,
        invoiceLogoMimeType: true,
      },
    });
    if (!row?.invoiceLogoRelativePath || !row.invoiceLogoOriginalName || !row.invoiceLogoMimeType) {
      throw new NotFoundException("No invoice logo uploaded");
    }
    await this.uploads.assertExists("clinics", row.invoiceLogoRelativePath);
    return {
      storageKey: row.invoiceLogoRelativePath,
      mimeType: row.invoiceLogoMimeType,
      originalFileName: row.invoiceLogoOriginalName,
    };
  }

  openClinicInvoiceLogoReadStream(storageKey: string) {
    return this.uploads.getReadStream("clinics", storageKey);
  }

  private async assertClinicInvoiceSettingsAccess(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
    requireAdmin: boolean,
  ): Promise<void> {
    const row = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true } });
    if (!row) throw new NotFoundException("Clinic not found");

    const adminRoles: Set<UserRole> = new Set([
      UserRole.GROUP_ADMIN,
      UserRole.CLINIC_ADMIN,
      UserRole.BRANCH_MANAGER,
    ]);
    if (requireAdmin && !adminRoles.has(viewer.role)) {
      throw new ForbiddenException("You do not have permission to update invoice settings");
    }

    if (viewer.role === UserRole.PHYSICIAN) {
      const net = await fetchPhysicianNetworkClinicIds(this.prisma, tenantId, viewer.userId);
      if (!net.includes(clinicId)) throw new NotFoundException("Clinic not found");
      return;
    }
    if (CLINIC_SCOPE_ROLES.has(viewer.role)) {
      const scope = await this.prisma.clinicAdminScope.findFirst({
        where: { tenantId, userId: viewer.userId, clinicId },
      });
      if (!scope) throw new NotFoundException("Clinic not found");
    }
  }

  async patchClinicInvoiceSettings(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
    body: { invoiceBackgroundColor?: string; invoiceSections?: string[] },
  ) {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, true);

    const data: Prisma.ClinicUpdateInput = {};
    if (body.invoiceBackgroundColor !== undefined) {
      if (!isInvoiceBackgroundColorId(body.invoiceBackgroundColor)) {
        throw new BadRequestException("Invalid invoice background color");
      }
      data.invoiceBackgroundColor = body.invoiceBackgroundColor;
    }
    if (body.invoiceSections !== undefined) {
      const sections = normalizeInvoiceSections(body.invoiceSections);
      data.invoiceSections = sections as unknown as Prisma.InputJsonValue;
    }
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.clinic.update({
      where: { id: clinicId },
      data,
      select: {
        id: true,
        invoiceBackgroundColor: true,
        invoiceSections: true,
        invoiceLogoRelativePath: true,
      },
    });

    return {
      clinicId: row.id,
      invoiceBackgroundColor: row.invoiceBackgroundColor,
      invoiceBackgroundHex: invoiceBackgroundHex(row.invoiceBackgroundColor),
      invoiceSections: normalizeInvoiceSections(row.invoiceSections),
      hasInvoiceLogo: Boolean(row.invoiceLogoRelativePath),
    };
  }

  async uploadClinicInvoiceLogo(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
    file?: Express.Multer.File,
  ) {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, true);
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("File too large (max 5MB)");
    const mime = file.mimetype || "application/octet-stream";
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    if (!allowed.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const docId = randomUUID();
    const base =
      path.basename(file.originalname || "invoice-logo").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "invoice-logo";
    const relativePath = `${tenantId}/${clinicId}/${docId}-${base}`;
    await this.uploads.put("clinics", relativePath, file.buffer, mime);

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        invoiceLogoRelativePath: relativePath,
        invoiceLogoOriginalName: file.originalname || base,
        invoiceLogoMimeType: mime,
      },
    });

    return { clinicId, hasInvoiceLogo: true };
  }

  async patchClinicPrescriptionSettings(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
    body: { prescriptionHeaderDescriptionEn?: string; prescriptionHeaderDescriptionAr?: string },
  ) {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, true);

    const data: Prisma.ClinicUpdateInput = {};
    if (body.prescriptionHeaderDescriptionEn !== undefined) {
      data.prescriptionHeaderDescriptionEn = body.prescriptionHeaderDescriptionEn.trim();
    }
    if (body.prescriptionHeaderDescriptionAr !== undefined) {
      data.prescriptionHeaderDescriptionAr = body.prescriptionHeaderDescriptionAr.trim();
    }
    if (!Object.keys(data).length) throw new BadRequestException("No supported fields to update");

    const row = await this.prisma.clinic.update({
      where: { id: clinicId },
      data,
      select: {
        id: true,
        prescriptionLogoRelativePath: true,
        prescriptionHeaderDescriptionEn: true,
        prescriptionHeaderDescriptionAr: true,
      },
    });

    return {
      clinicId: row.id,
      hasPrescriptionLogo: Boolean(row.prescriptionLogoRelativePath),
      prescriptionHeaderDescriptionEn: row.prescriptionHeaderDescriptionEn,
      prescriptionHeaderDescriptionAr: row.prescriptionHeaderDescriptionAr,
    };
  }

  async uploadClinicPrescriptionLogo(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
    file?: Express.Multer.File,
  ) {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, true);
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("File too large (max 5MB)");
    const mime = file.mimetype || "application/octet-stream";
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    if (!allowed.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const docId = randomUUID();
    const base =
      path.basename(file.originalname || "prescription-logo").replace(/[^\w.\-]+/g, "_").slice(0, 120) ||
      "prescription-logo";
    const relativePath = `${tenantId}/${clinicId}/rx-${docId}-${base}`;
    await this.uploads.put("clinics", relativePath, file.buffer, mime);

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        prescriptionLogoRelativePath: relativePath,
        prescriptionLogoOriginalName: file.originalname || base,
        prescriptionLogoMimeType: mime,
      },
    });

    return { clinicId, hasPrescriptionLogo: true };
  }

  async getClinicPrescriptionLogoMeta(
    tenantId: string,
    clinicId: string,
    viewer: JwtUser,
  ): Promise<{ storageKey: string; mimeType: string; originalFileName: string }> {
    await this.assertClinicInvoiceSettingsAccess(tenantId, clinicId, viewer, false);
    const row = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: {
        prescriptionLogoRelativePath: true,
        prescriptionLogoOriginalName: true,
        prescriptionLogoMimeType: true,
      },
    });
    if (!row?.prescriptionLogoRelativePath || !row.prescriptionLogoOriginalName || !row.prescriptionLogoMimeType) {
      throw new NotFoundException("No prescription logo uploaded");
    }
    await this.uploads.assertExists("clinics", row.prescriptionLogoRelativePath);
    return {
      storageKey: row.prescriptionLogoRelativePath,
      mimeType: row.prescriptionLogoMimeType,
      originalFileName: row.prescriptionLogoOriginalName,
    };
  }

  openClinicPrescriptionLogoReadStream(storageKey: string) {
    return this.uploads.getReadStream("clinics", storageKey);
  }
}
