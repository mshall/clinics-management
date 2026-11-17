import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalSubmissionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import type { PatchClinicEtaSettingsDto } from "../clinics/dto/patch-clinic-eta-settings.dto";
import {
  mergeProviderBlock,
  patchEtaClinicProviderSettings,
  resolveEtaClinicSettings,
} from "../providers/provider-settings";
import { buildEtaReceiptQrPayload, type EtaReceiptViewDto } from "./eta-receipt-presenter";
import { FiscalSubmitService } from "./fiscal-submit.service";
import { ConsentPolicyService } from "./consent-policy.service";
import { CONSENT_PURPOSE_DATA } from "./consent-policy.constants";

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalSubmit: FiscalSubmitService,
    private readonly consent: ConsentPolicyService,
  ) {}

  async recordDataProtectionConsent(
    tenantId: string,
    patientId: string,
    body: { signerName?: string; signedOnTablet?: boolean; locale?: string; ipAddress?: string },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } });
    if (!patient) throw new NotFoundException("Patient not found");
    const row = await this.prisma.patientDataProtectionConsent.create({
      data: {
        tenantId,
        patientId,
        signerName: body.signerName?.trim() || null,
        signedOnTablet: body.signedOnTablet ?? true,
        locale: body.locale?.trim() || "ar",
        ipAddress: body.ipAddress?.trim() || null,
      },
    });
    await this.consent.capture(
      tenantId,
      patientId,
      CONSENT_PURPOSE_DATA,
      {
        granted: true,
        source: body.signedOnTablet === false ? "data_protection_staff" : "data_protection_tablet",
        signerName: body.signerName,
        signedOnTablet: body.signedOnTablet ?? true,
      },
      null,
    );
    return row;
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
    return this.fiscalSubmit.submitOne(tenantId, id);
  }

  async resubmitRejectedFiscal(tenantId: string, id: string, body: import("./dto/resubmit-fiscal-submission.dto").ResubmitFiscalSubmissionDto) {
    return this.fiscalSubmit.resubmitRejected(tenantId, id, body);
  }

  async patchClinicEtaSettings(tenantId: string, clinicId: string, dto: PatchClinicEtaSettingsDto) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const etaPatch = patchEtaClinicProviderSettings({
      branchCode: dto.etaBranchCode,
      taxpayerActivityCode: dto.etaTaxpayerActivityCode,
      defaultItemCode: dto.etaDefaultItemCode,
      receiptsEnabled: dto.etaReceiptsEnabled,
      includeLogoOnReceipt: dto.etaIncludeLogoOnReceipt,
    });
    const row = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(Object.keys(etaPatch).length
          ? { providerSettings: mergeProviderBlock(clinic.providerSettings, "eta-egypt", etaPatch) }
          : {}),
      },
      select: { id: true, providerSettings: true },
    });
    const eta = resolveEtaClinicSettings(row);
    return {
      id: row.id,
      etaBranchCode: eta.branchCode,
      etaTaxpayerActivityCode: eta.taxpayerActivityCode,
      etaDefaultItemCode: eta.defaultItemCode,
      etaReceiptsEnabled: eta.receiptsEnabled,
      etaIncludeLogoOnReceipt: eta.includeLogoOnReceipt,
    };
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
    const etaClinic = resolveEtaClinicSettings(row.clinic);
    const showLogo = etaClinic.includeLogoOnReceipt && Boolean(row.clinic.invoiceLogoRelativePath);
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
      branchCode: payload?.branchCode ?? etaClinic.branchCode ?? row.clinicId.slice(0, 8),
      taxpayerActivityCode: payload?.taxpayerActivityCode ?? etaClinic.taxpayerActivityCode ?? "8690",
      itemCode: line?.itemCode ?? etaClinic.defaultItemCode,
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