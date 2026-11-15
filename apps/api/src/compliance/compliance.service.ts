import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalSubmissionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import type { PatchClinicEtaSettingsDto } from "../clinics/dto/patch-clinic-eta-settings.dto";
import { buildEtaReceiptQrPayload, type EtaReceiptViewDto } from "./eta-receipt-presenter";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDataProtectionConsent(
    tenantId: string,
    patientId: string,
    body: { signerName?: string; signedOnTablet?: boolean; locale?: string; ipAddress?: string },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } });
    if (!patient) throw new NotFoundException("Patient not found");
    return this.prisma.patientDataProtectionConsent.create({
      data: {
        tenantId,
        patientId,
        signerName: body.signerName?.trim() || null,
        signedOnTablet: body.signedOnTablet ?? true,
        locale: body.locale?.trim() || "ar",
        ipAddress: body.ipAddress?.trim() || null,
      },
    });
  }

  async latestConsent(tenantId: string, patientId: string) {
    return this.prisma.patientDataProtectionConsent.findFirst({
      where: { tenantId, patientId },
      orderBy: { signedAt: "desc" },
    });
  }

  async listEtaQueue(tenantId: string, clinicId?: string) {
    return this.prisma.fiscalSubmission.findMany({
      where: {
        tenantId,
        ...(clinicId ? { clinicId } : {}),
        status: { in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.REJECTED] },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  async submitEtaToAuthority(tenantId: string, id: string) {
    const row = await this.prisma.fiscalSubmission.findFirst({
      where: { id, tenantId },
      include: { fiscalDocument: true },
    });
    if (!row) throw new NotFoundException("Fiscal submission not found");
    if (row.status === FiscalSubmissionStatus.SUBMITTED || row.status === FiscalSubmissionStatus.ACCEPTED) {
      return row;
    }
    const provider = getFiscalProvider(row.providerKey);
    if (!provider) throw new BadRequestException(`Unknown fiscal provider: ${row.providerKey}`);
    const payload = row.payloadJson;
    if (!payload) throw new BadRequestException("Submission is missing payload");
    const cred = await this.prisma.providerCredential.findFirst({
      where: { tenantId, clinicId: row.clinicId, providerKey: row.providerKey },
      select: { secretRef: true },
    });
    const result = await provider.submit(payload, row.signature?.trim() ?? "", cred?.secretRef ?? null);
    if (!result.ok) {
      return this.prisma.fiscalSubmission.update({
        where: { id },
        data: {
          status: FiscalSubmissionStatus.REJECTED,
          errorMessage: result.error,
        },
      });
    }
    return this.prisma.fiscalSubmission.update({
      where: { id },
      data: {
        status: FiscalSubmissionStatus.SUBMITTED,
        providerDocumentUuid: result.providerDocumentUuid,
        submittedAt: new Date(),
        errorMessage: result.mode === "sandbox" ? "Sandbox UUID (provider credentials not configured)" : null,
      },
    });
  }

  async patchClinicEtaSettings(tenantId: string, clinicId: string, dto: PatchClinicEtaSettingsDto) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(dto.etaBranchCode !== undefined ? { etaBranchCode: dto.etaBranchCode?.trim() || null } : {}),
        ...(dto.etaTaxpayerActivityCode !== undefined
          ? { etaTaxpayerActivityCode: dto.etaTaxpayerActivityCode?.trim() || null }
          : {}),
        ...(dto.etaDefaultItemCode !== undefined ? { etaDefaultItemCode: dto.etaDefaultItemCode?.trim() || null } : {}),
        ...(dto.etaReceiptsEnabled !== undefined ? { etaReceiptsEnabled: dto.etaReceiptsEnabled } : {}),
        ...(dto.etaIncludeLogoOnReceipt !== undefined
          ? { etaIncludeLogoOnReceipt: dto.etaIncludeLogoOnReceipt }
          : {}),
      },
      select: {
        id: true,
        etaBranchCode: true,
        etaTaxpayerActivityCode: true,
        etaDefaultItemCode: true,
        etaReceiptsEnabled: true,
        etaIncludeLogoOnReceipt: true,
      },
    });
  }

  async getEtaReceiptView(tenantId: string, id: string): Promise<EtaReceiptViewDto> {
    const row = await this.prisma.fiscalSubmission.findFirst({
      where: { id, tenantId },
      include: {
        clinic: true,
        patient: { select: { firstNameEn: true, lastNameEn: true, mrn: true } },
        fiscalDocument: true,
      },
    });
    if (!row) throw new NotFoundException("Fiscal submission not found");
    const payload = row.payloadJson as unknown as EtaReceiptPayload | null;
    const line = payload?.lines?.[0];
    const total = line?.unitPrice ?? payload?.totalAmount ?? Number(row.fiscalDocument.totalAmount);
    const showLogo = row.clinic.etaIncludeLogoOnReceipt && Boolean(row.clinic.invoiceLogoRelativePath);
    const submittedAt = row.submittedAt?.toISOString() ?? null;
    return {
      id: row.id,
      status: row.status,
      etaUuid: row.providerDocumentUuid,
      submittedAt,
      clinic: {
        nameEn: row.clinic.nameEn,
        nameAr: row.clinic.nameAr,
        addressEn: row.clinic.addressEn,
        addressAr: row.clinic.addressAr,
        phone: row.clinic.phone,
        email: row.clinic.email,
        taxRegistrationNumber: row.clinic.taxRegistrationNumber,
        licenseNumber: row.clinic.licenseNumber,
        logoUrl: showLogo ? `/api/v1/invoices/clinics/${row.clinicId}/logo` : null,
        showLogo,
      },
      lineDescription: line?.description ?? "Medical service",
      totalAmount: total,
      currency: line?.currency ?? payload?.currency ?? row.fiscalDocument.currency,
      vatPercent: line?.vatPercent ?? 0,
      patientLabel: `${row.patient.firstNameEn} ${row.patient.lastNameEn}`.trim(),
      issuerRin: payload?.issuerRin ?? row.clinic.taxRegistrationNumber ?? "N/A",
      branchCode: payload?.branchCode ?? row.clinic.etaBranchCode ?? row.clinicId.slice(0, 8),
      taxpayerActivityCode: payload?.taxpayerActivityCode ?? "8690",
      itemCode: line?.itemCode ?? row.clinic.etaDefaultItemCode,
      qrPayload: buildEtaReceiptQrPayload({
        etaUuid: row.providerDocumentUuid,
        issuerRin: payload?.issuerRin ?? "N/A",
        totalAmount: total,
        currency: line?.currency ?? row.fiscalDocument.currency,
        submittedAt,
      }),
    };
  }
}