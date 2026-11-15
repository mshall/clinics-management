import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EtaReceiptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { submitEtaReceipt, signEtaPayload, type EtaReceiptPayload } from "./eta-egypt.client";

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

  /** Submits a queued receipt to the Egyptian Tax Authority (signed payload + OAuth). */
  async submitEtaToAuthority(tenantId: string, id: string) {
    const row = await this.prisma.etaReceiptSubmission.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("ETA submission not found");
    if (row.status === EtaReceiptStatus.SUBMITTED || row.status === EtaReceiptStatus.ACCEPTED) {
      return row;
    }
    const payload = row.payloadJson as unknown as EtaReceiptPayload | null;
    if (!payload?.idempotencyKey) {
      throw new BadRequestException("ETA submission is missing a signed payload");
    }
    const signature = row.signature?.trim() || signEtaPayload(payload);
    const result = await submitEtaReceipt(payload, signature);
    if (!result.ok) {
      return this.prisma.etaReceiptSubmission.update({
        where: { id },
        data: {
          status: EtaReceiptStatus.REJECTED,
          errorMessage: result.error,
          signature: signature || null,
        },
      });
    }
    return this.prisma.etaReceiptSubmission.update({
      where: { id },
      data: {
        status: EtaReceiptStatus.SUBMITTED,
        etaUuid: result.etaUuid,
        submittedAt: new Date(),
        signature: signature || null,
        errorMessage: result.mode === "sandbox" ? "Sandbox UUID (ETA credentials not configured)" : null,
      },
    });
  }
}
