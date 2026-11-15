import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalSubmissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { signEtaPayload, submitEtaReceipt } from "./eta-egypt.client";
import { resolveEtaConnection, type EtaConnectionConfig } from "./eta-secret-resolver";
import { buildEtaWireReceiptDocument, type EtaWireBuildContext } from "./eta-egypt-wire";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";

type ResolvedPos = {
  deviceId: string;
  secretRef: string | null;
  connection: EtaConnectionConfig | null;
};

@Injectable()
export class FiscalSubmitService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolvePos(tenantId: string, clinicId: string, providerKey: string): Promise<ResolvedPos> {
    const cred = await this.prisma.providerCredential.findFirst({
      where: { tenantId, clinicId, providerKey },
      orderBy: { createdAt: "asc" },
      select: { deviceId: true, secretRef: true },
    });
    if (!cred?.deviceId?.trim()) {
      throw new BadRequestException(
        "ETA requires a ProviderCredential with deviceId (POS serial) for this clinic before submitting receipts",
      );
    }
    const connection = await resolveEtaConnection(cred.secretRef);
    return { deviceId: cred.deviceId.trim(), secretRef: cred.secretRef, connection };
  }

  private async assertHeadOfDeviceQueue(
    tenantId: string,
    clinicId: string,
    providerKey: string,
    deviceId: string,
    submissionId: string,
  ): Promise<void> {
    const head = await this.prisma.fiscalSubmission.findFirst({
      where: {
        tenantId,
        clinicId,
        providerKey,
        deviceId,
        status: { in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.REJECTED] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (head && head.id !== submissionId) {
      throw new BadRequestException(
        "Submit receipts in queue order for this POS device; an earlier receipt is still pending",
      );
    }
  }

  async submitOne(tenantId: string, submissionId: string) {
    const row = await this.prisma.fiscalSubmission.findFirst({
      where: { id: submissionId, tenantId },
      include: { fiscalDocument: true },
    });
    if (!row) throw new NotFoundException("Fiscal submission not found");
    if (row.status === FiscalSubmissionStatus.SUBMITTED || row.status === FiscalSubmissionStatus.ACCEPTED) {
      return row;
    }
    const provider = getFiscalProvider(row.providerKey);
    if (!provider) throw new BadRequestException(`Unknown fiscal provider: ${row.providerKey}`);
    const draft = row.payloadJson as unknown as EtaReceiptPayload | null;
    if (!draft) throw new BadRequestException("Submission is missing payload");

    const pos = await this.resolvePos(tenantId, row.clinicId, row.providerKey);
    const deviceId = row.deviceId?.trim() || pos.deviceId;
    await this.assertHeadOfDeviceQueue(tenantId, row.clinicId, row.providerKey, deviceId, row.id);

    return this.prisma.$transaction(async (tx) => {
      const chain = await tx.fiscalPosChain.upsert({
        where: {
          tenantId_clinicId_providerKey_deviceId: {
            tenantId,
            clinicId: row.clinicId,
            providerKey: row.providerKey,
            deviceId,
          },
        },
        create: {
          tenantId,
          clinicId: row.clinicId,
          providerKey: row.providerKey,
          deviceId,
          lastAcceptedUuid: null,
        },
        update: {},
      });

      const previousUUID = chain.lastAcceptedUuid?.trim() ?? "";

      const buildCtx: EtaWireBuildContext = {
        payload: draft,
        previousUUID,
        deviceSerial: deviceId,
        internalId: row.idempotencyKey ?? row.id,
        referenceUuid: draft.referenceReceiptUuid,
      };
      const wire = buildEtaWireReceiptDocument(buildCtx);
      const forHash = { ...wire, header: { ...wire.header, uuid: "" } };
      const receiptUuid = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
      wire.header.uuid = receiptUuid;

      const finalPayload: EtaReceiptPayload = {
        ...draft,
        receiptUuid,
        previousReceiptUuid: previousUUID || undefined,
      };
      const signature = signEtaPayload(finalPayload, pos.connection?.signingKey);

      await tx.fiscalSubmission.update({
        where: { id: row.id },
        data: {
          deviceId,
          payloadJson: finalPayload as unknown as Prisma.InputJsonValue,
          signature,
        },
      });

      const result = await submitEtaReceipt(finalPayload, signature, pos.connection, {
        posSerial: pos.connection?.posSerial?.trim() || deviceId,
        posOsVersion: pos.connection?.posOsVersion,
        posModelFramework: pos.connection?.posModelFramework,
        presharedKey: pos.connection?.presharedKey,
      });

      if (!result.ok) {
        return tx.fiscalSubmission.update({
          where: { id: row.id },
          data: {
            status: FiscalSubmissionStatus.REJECTED,
            errorMessage: result.error,
          },
        });
      }

      const acceptedUuid = result.receiptUuid?.trim() || receiptUuid;

      await tx.fiscalPosChain.update({
        where: {
          tenantId_clinicId_providerKey_deviceId: {
            tenantId,
            clinicId: row.clinicId,
            providerKey: row.providerKey,
            deviceId,
          },
        },
        data: { lastAcceptedUuid: acceptedUuid },
      });

      return tx.fiscalSubmission.update({
        where: { id: row.id },
        data: {
          status: FiscalSubmissionStatus.SUBMITTED,
          providerDocumentUuid: acceptedUuid,
          submittedAt: new Date(),
          errorMessage: result.mode === "sandbox" ? "Sandbox (provider credentials not configured)" : null,
        },
      });
    });
  }
}