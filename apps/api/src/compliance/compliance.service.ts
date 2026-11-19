import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ConsentPolicyService } from "./consent-policy.service";
import { CONSENT_PURPOSE_DATA } from "./consent-policy.constants";

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
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
}