import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalDeviceStatus, FiscalSubmissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { signEtaPayload, submitEtaReceipt } from "./eta-egypt.client";
import { resolveEtaConnection } from "./eta-secret-resolver";
import { buildEtaWireReceiptDocument, type EtaWireBuildContext } from "./eta-egypt-wire";

@Injectable()
export class FiscalSubmitService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertHeadOfDeviceQueue(fiscalDeviceId: string, submissionId: string): Promise<void> {
    const head = await this.prisma.fiscalSubmission.findFirst({
      where: {
        fiscalDeviceId,
        status: { in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.REJECTED] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (head && head.id !== submissionId) {
      throw new BadRequestException(
        "Submit receipts in queue order for this device; an earlier receipt is still pending",
      );
    }
  }

  async submitOne(tenantId: string, submissionId: string) {
    const row = await this.prisma.fiscalSubmission.findFirst({
      where: { id: submissionId, tenantId },
      include: { fiscalDocument: true, fiscalDevice: { include: { credential: true } } },
    });
    if (!row) throw new NotFoundException("Fiscal submission not found");
    if (row.status === FiscalSubmissionStatus.SUBMITTED || row.status === FiscalSubmissionStatus.ACCEPTED) {
      return row;
    }
    if (!row.fiscalDeviceId || !row.fiscalDevice) {
      throw new BadRequestException("Submission is not linked to a fiscal device");
    }
    const device = row.fiscalDevice;
    if (device.status !== FiscalDeviceStatus.ACTIVE || !device.credential?.secretRef) {
      throw new BadRequestException("Fiscal device is not active or has no credentials");
    }

    const provider = getFiscalProvider(row.providerKey);
    if (!provider) throw new BadRequestException(`Unknown fiscal provider: ${row.providerKey}`);
    const draft = row.payloadJson as unknown as EtaReceiptPayload | null;
    if (!draft) throw new BadRequestException("Submission is missing payload");

    if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
      const ref = device.credential.secretRef.trim();
      if (ref.startsWith("local:") || ref.startsWith("env:")) {
        throw new BadRequestException("Production submit requires Secrets Manager device credentials");
      }
    }

    await this.assertHeadOfDeviceQueue(row.fiscalDeviceId, row.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FiscalDevice" WHERE id = ${row.fiscalDeviceId} FOR UPDATE`;
      const locked = await tx.fiscalDevice.findUniqueOrThrow({
        where: { id: row.fiscalDeviceId! },
        include: { credential: true },
      });

      const previousUUID = locked.lastReceiptUuid?.trim() ?? "";
      const receiptNumber = locked.receiptSequence + 1;
      const internalId = `${locked.serialNumber}-${String(receiptNumber).padStart(8, "0")}`;

      const buildCtx: EtaWireBuildContext = {
        payload: draft,
        previousUUID,
        deviceSerial: locked.serialNumber,
        internalId,
        referenceUuid: draft.referenceReceiptUuid,
      };
      const wire = buildEtaWireReceiptDocument(buildCtx);
      const receiptUuid =
        provider.computeDocumentUuid?.({ ...wire, header: { ...wire.header, uuid: "" } }, previousUUID) ??
        wire.header.uuid;

      if (!receiptUuid) {
        throw new BadRequestException("Provider did not compute receipt UUID");
      }
      wire.header.uuid = receiptUuid;

      const finalPayload: EtaReceiptPayload = {
        ...draft,
        receiptUuid,
        previousReceiptUuid: previousUUID || undefined,
      };
      const connection = await resolveEtaConnection(locked.credential?.secretRef ?? null);
      const signature = signEtaPayload(finalPayload, connection?.signingKey);

      await tx.fiscalSubmission.update({
        where: { id: row.id },
        data: {
          deviceId: locked.serialNumber,
          receiptNumber,
          payloadJson: finalPayload as unknown as Prisma.InputJsonValue,
          signature,
        },
      });

      const result = await submitEtaReceipt(finalPayload, signature, connection, {
        posSerial: connection?.posSerial?.trim() || locked.serialNumber,
        posOsVersion: connection?.posOsVersion,
        posModelFramework: connection?.posModelFramework,
        presharedKey: connection?.presharedKey,
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

      await tx.fiscalDevice.update({
        where: { id: locked.id },
        data: {
          lastReceiptUuid: acceptedUuid,
          receiptSequence: receiptNumber,
          lastSubmittedAt: new Date(),
        },
      });

      return tx.fiscalSubmission.update({
        where: { id: row.id },
        data: {
          status: FiscalSubmissionStatus.SUBMITTED,
          providerDocumentUuid: acceptedUuid,
          submittedAt: new Date(),
          errorMessage: result.mode === "sandbox" ? "Sandbox (device credentials not configured)" : null,
        },
      });
    });
  }
}