import { Injectable, NotFoundException } from "@nestjs/common";
import { EtaReceiptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
    return this.prisma.etaReceiptSubmission.findMany({
      where: {
        tenantId,
        ...(clinicId ? { clinicId } : {}),
        status: { in: [EtaReceiptStatus.PENDING, EtaReceiptStatus.REJECTED] },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  /** Marks receipt submitted — replace with real ETA API when credentials are configured. */
  async markEtaSubmitted(tenantId: string, id: string, etaUuid: string) {
    const row = await this.prisma.etaReceiptSubmission.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("ETA submission not found");
    return this.prisma.etaReceiptSubmission.update({
      where: { id },
      data: {
        status: EtaReceiptStatus.SUBMITTED,
        etaUuid: etaUuid.trim(),
        submittedAt: new Date(),
      },
    });
  }
}
