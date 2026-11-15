import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { FiscalDeviceStatus, FiscalSubmissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { signEtaPayload, submitEtaReceipt } from "./eta-egypt.client";
import { resolveEtaConnection } from "./eta-secret-resolver";
import { buildEtaWireReceiptDocument, type EtaWireBuildContext } from "./eta-egypt-wire";

const PREPARE_TX_MS = 15_000;
const FINALIZE_TX_MS = 15_000;
const EGP_BUYER_NAME_THRESHOLD = 150_000;

type PreparedSubmit = {
  submissionId: string;
  fiscalDeviceId: string;
  finalPayload: EtaReceiptPayload;
  signature: string;
  receiptNumber: number;
  receiptUuid: string;
  resubmission: boolean;
};

@Injectable()
export class FiscalSubmitService {
  private readonly log = new Logger(FiscalSubmitService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertBuyerNameForAmount(payload: EtaReceiptPayload): void {
    if (payload.currency !== "EGP" || payload.totalAmount < EGP_BUYER_NAME_THRESHOLD) return;
    const name = payload.buyerName?.trim();
    if (!name || name.toLowerCase() === "patient") {
      throw new BadRequestException(
        "Buyer name is required on ETA receipts at or above EGP 150,000 (operations / high-value care)",
      );
    }
  }

  private payloadIsFinalized(payload: EtaReceiptPayload | null): payload is EtaReceiptPayload {
    return Boolean(payload?.receiptUuid?.trim());
  }

  private async assertHeadOfDeviceQueue(
    fiscalDeviceId: string,
    submissionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const head = await tx.fiscalSubmission.findFirst({
      where: {
        fiscalDeviceId,
        status: {
          in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.SUBMITTING],
        },
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

  async prepareSubmission(tenantId: string, submissionId: string): Promise<PreparedSubmit> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.fiscalSubmission.findFirst({
          where: { id: submissionId, tenantId },
          include: { fiscalDevice: { include: { credential: true } } },
        });
        if (!row) throw new NotFoundException("Fiscal submission not found");
        if (
          row.status === FiscalSubmissionStatus.SUBMITTED ||
          row.status === FiscalSubmissionStatus.ACCEPTED
        ) {
          const existing = row.payloadJson as unknown as EtaReceiptPayload;
          if (!this.payloadIsFinalized(existing)) {
            throw new BadRequestException("Submission already completed without finalized payload");
          }
          return {
            submissionId: row.id,
            fiscalDeviceId: row.fiscalDeviceId!,
            finalPayload: existing,
            signature: row.signature?.trim() || "",
            receiptNumber: row.receiptNumber ?? 0,
            receiptUuid: existing.receiptUuid,
            resubmission: true,
          };
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

        if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
          const ref = device.credential.secretRef.trim();
          if (ref.startsWith("local:") || ref.startsWith("env:")) {
            throw new BadRequestException("Production submit requires Secrets Manager device credentials");
          }
        }

        await this.assertHeadOfDeviceQueue(row.fiscalDeviceId, row.id, tx);
        await tx.$queryRaw`SELECT id FROM "FiscalDevice" WHERE id = ${row.fiscalDeviceId} FOR UPDATE`;

        const draft = row.payloadJson as unknown as EtaReceiptPayload | null;
        if (!draft) throw new BadRequestException("Submission is missing payload");

        if (row.status === FiscalSubmissionStatus.SUBMITTING && this.payloadIsFinalized(draft)) {
          return {
            submissionId: row.id,
            fiscalDeviceId: row.fiscalDeviceId,
            finalPayload: draft,
            signature: row.signature?.trim() || signEtaPayload(draft),
            receiptNumber: row.receiptNumber ?? 0,
            receiptUuid: draft.receiptUuid,
            resubmission: true,
          };
        }

        const locked = await tx.fiscalDevice.findUniqueOrThrow({
          where: { id: row.fiscalDeviceId },
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

        if (!receiptUuid) throw new BadRequestException("Provider did not compute receipt UUID");

        const finalPayload: EtaReceiptPayload = {
          ...draft,
          receiptUuid,
          previousReceiptUuid: previousUUID || undefined,
        };
        this.assertBuyerNameForAmount(finalPayload);
        const connection = await resolveEtaConnection(device.credential?.secretRef ?? null);
        const signature = signEtaPayload(finalPayload, connection?.signingKey);

        await tx.fiscalSubmission.update({
          where: { id: row.id },
          data: {
            status: FiscalSubmissionStatus.SUBMITTING,
            deviceId: locked.serialNumber,
            receiptNumber,
            payloadJson: finalPayload as unknown as Prisma.InputJsonValue,
            signature,
            errorMessage: null,
          },
        });

        return {
          submissionId: row.id,
          fiscalDeviceId: row.fiscalDeviceId,
          finalPayload,
          signature,
          receiptNumber,
          receiptUuid,
          resubmission: false,
        };
      },
      { timeout: PREPARE_TX_MS },
    );
  }

  private async finalizeSubmission(
    tenantId: string,
    prepared: PreparedSubmit,
    result: Awaited<ReturnType<typeof submitEtaReceipt>>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.fiscalSubmission.findFirst({
          where: { id: prepared.submissionId, tenantId },
        });
        if (!row || !row.fiscalDeviceId) throw new NotFoundException("Fiscal submission not found");

        await tx.$queryRaw`SELECT id FROM "FiscalDevice" WHERE id = ${row.fiscalDeviceId} FOR UPDATE`;

        if (row.status === FiscalSubmissionStatus.SUBMITTED || row.status === FiscalSubmissionStatus.ACCEPTED) {
          return row;
        }

        if (!result.ok) {
          const attempts = row.submitAttempts + 1;
          const backoffMinutes = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
          const nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000);
          return tx.fiscalSubmission.update({
            where: { id: row.id },
            data: {
              status: FiscalSubmissionStatus.SUBMITTING,
              errorMessage: result.error,
              submitAttempts: attempts,
              nextRetryAt,
            },
          });
        }

        const acceptedUuid = result.receiptUuid?.trim() || prepared.receiptUuid;

        await tx.fiscalDevice.update({
          where: { id: row.fiscalDeviceId },
          data: {
            lastReceiptUuid: acceptedUuid,
            receiptSequence: prepared.receiptNumber,
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
            submitAttempts: row.submitAttempts + 1,
            nextRetryAt: null,
            payloadJson: prepared.finalPayload as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: FINALIZE_TX_MS },
    );
  }

  async submitOne(tenantId: string, submissionId: string) {
    const row = await this.prisma.fiscalSubmission.findFirst({
      where: { id: submissionId, tenantId },
      include: { fiscalDevice: { include: { credential: true } } },
    });
    if (!row) throw new NotFoundException("Fiscal submission not found");
    if (row.status === FiscalSubmissionStatus.SUBMITTED || row.status === FiscalSubmissionStatus.ACCEPTED) {
      return row;
    }
    if (row.status === FiscalSubmissionStatus.REJECTED) {
      throw new BadRequestException("Rejected submissions must be re-queued manually");
    }

    const prepared = await this.prepareSubmission(tenantId, submissionId);
    const device = await this.prisma.fiscalDevice.findUniqueOrThrow({
      where: { id: prepared.fiscalDeviceId },
      include: { credential: true },
    });
    const connection = await resolveEtaConnection(device.credential?.secretRef ?? null);

    let result: Awaited<ReturnType<typeof submitEtaReceipt>>;
    try {
      result = await submitEtaReceipt(prepared.finalPayload, prepared.signature, connection, {
        posSerial: connection?.posSerial?.trim() || device.serialNumber,
        posOsVersion: connection?.posOsVersion,
        posModelFramework: connection?.posModelFramework,
        presharedKey: connection?.presharedKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`ETA submit network error for ${submissionId}: ${msg}`);
      result = { ok: false, error: msg, mode: "live" };
    }

    return this.finalizeSubmission(tenantId, prepared, result);
  }
}