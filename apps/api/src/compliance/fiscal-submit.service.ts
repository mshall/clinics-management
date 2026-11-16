import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { FiscalDeviceStatus, FiscalSubmissionStatus, IntegrationFailureCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import {
  fetchEtaReceiptValidationStatus,
  signEtaWireDocument,
  submitEtaWireDocument,
} from "./eta-egypt.client";
import { resolveEtaConnection } from "./eta-secret-resolver";
import { buildEtaWireReceiptDocument, type EtaWireBuildContext } from "./eta-egypt-wire";
import {
  assertWireUuidMatchesContentHash,
  isEtaStoredSubmissionPayload,
  type EtaStoredSubmissionPayload,
} from "./eta-stored-submission";
import { queueFiscalDocument } from "./fiscal-queue";
import { resolveSaleReturnPrepareOutcome } from "./fiscal-return-reference";

const PREPARE_TX_MS = 15_000;
const FINALIZE_TX_MS = 15_000;
const CLAIM_MS = 5 * 60_000;

type PreparedSubmit = {
  submissionId: string;
  fiscalDeviceId: string;
  stored: EtaStoredSubmissionPayload;
  signature: string;
  resubmission: boolean;
};

export type PrepareSubmissionResult = PreparedSubmit | { cancelled: true } | { deferred: true };

function isPreparedSubmit(prepared: PrepareSubmissionResult): prepared is PreparedSubmit {
  return !("cancelled" in prepared) && !("deferred" in prepared);
}

function workerInstanceId(): string {
  return process.env.FISCAL_WORKER_ID?.trim() || process.env.HOSTNAME?.trim() || "kiorly-worker";
}

@Injectable()
export class FiscalSubmitService {
  private readonly log = new Logger(FiscalSubmitService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async prepareSubmission(tenantId: string, submissionId: string): Promise<PrepareSubmissionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FiscalSubmission" WHERE id = ${submissionId} FOR UPDATE`;
        const row = await tx.fiscalSubmission.findFirst({
          where: { id: submissionId, tenantId },
          include: { fiscalDevice: { include: { credential: true } } },
        });
        if (!row) throw new NotFoundException("Fiscal submission not found");

        const workerId = workerInstanceId();
        if (
          row.claimedUntil &&
          row.claimedUntil > new Date() &&
          row.claimedBy &&
          row.claimedBy !== workerId
        ) {
          throw new BadRequestException("Submission is being processed by another instance");
        }

        if (row.status === FiscalSubmissionStatus.CANCELLED) {
          throw new BadRequestException("Fiscal submission was cancelled");
        }

        if (
          row.status === FiscalSubmissionStatus.SUBMITTED ||
          row.status === FiscalSubmissionStatus.ACCEPTED
        ) {
          if (!isEtaStoredSubmissionPayload(row.payloadJson)) {
            throw new BadRequestException("Submission already completed without stored wire document");
          }
          return {
            submissionId: row.id,
            fiscalDeviceId: row.fiscalDeviceId!,
            stored: row.payloadJson,
            signature: row.signature?.trim() || "",
            resubmission: true,
          };
        }

        if (!row.fiscalDeviceId || !row.fiscalDevice) {
          throw new BadRequestException("Submission is not linked to a fiscal device");
        }
        const device = row.fiscalDevice;
        const storedRetry =
          row.status === FiscalSubmissionStatus.SUBMITTING &&
          isEtaStoredSubmissionPayload(row.payloadJson);
        const deviceReady = device.status === FiscalDeviceStatus.ACTIVE && Boolean(device.credential?.secretRef);
        if (!deviceReady && !storedRetry) {
          throw new BadRequestException("Fiscal device is not active or has no credentials");
        }

        const provider = getFiscalProvider(row.providerKey);
        if (!provider) throw new BadRequestException(`Unknown fiscal provider: ${row.providerKey}`);

        if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
          const ref = device.credential?.secretRef?.trim();
          if (ref?.startsWith("local:") || ref?.startsWith("env:")) {
            throw new BadRequestException("Production submit requires Secrets Manager device credentials");
          }
        }

        await tx.$queryRaw`SELECT id FROM "FiscalDevice" WHERE id = ${row.fiscalDeviceId} FOR UPDATE`;
        await this.assertHeadOfDeviceQueue(row.fiscalDeviceId, row.id, tx);

        if (
          row.status === FiscalSubmissionStatus.SUBMITTING &&
          isEtaStoredSubmissionPayload(row.payloadJson)
        ) {
          return {
            submissionId: row.id,
            fiscalDeviceId: row.fiscalDeviceId,
            stored: row.payloadJson,
            signature: row.signature?.trim() || signEtaWireDocument(row.payloadJson.wireDocument),
            resubmission: true,
          };
        }

        const draft = row.payloadJson as unknown as EtaReceiptPayload | EtaStoredSubmissionPayload | null;
        if (!draft || isEtaStoredSubmissionPayload(draft)) {
          throw new BadRequestException("Submission is missing draft payload");
        }

        const locked = await tx.fiscalDevice.findUniqueOrThrow({
          where: { id: row.fiscalDeviceId },
        });

        const previousUUID = locked.lastReceiptUuid?.trim() ?? "";
        const receiptNumber = locked.receiptSequence + 1;
        const internalId = `${locked.serialNumber}-${String(receiptNumber).padStart(8, "0")}`;
        const issuedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

        let referenceUuid = draft.referenceReceiptUuid?.trim() || undefined;
        const returnForDocId = draft.returnForFiscalDocumentId?.trim();
        if (draft.documentNature === "return" && returnForDocId) {
          const outcome = await resolveSaleReturnPrepareOutcome(tx, returnForDocId);
          if (outcome.action === "cancel") {
            await tx.fiscalSubmission.update({
              where: { id: row.id },
              data: {
                status: FiscalSubmissionStatus.CANCELLED,
                errorMessage: `Return cancelled: ${outcome.reason}`,
                claimedUntil: null,
                claimedBy: null,
                nextRetryAt: null,
              },
            });
            return { cancelled: true };
          }
          if (outcome.action === "wait") {
            await tx.fiscalSubmission.update({
              where: { id: row.id },
              data: {
                status: FiscalSubmissionStatus.PENDING,
                nextRetryAt: new Date(Date.now() + 90_000),
                claimedUntil: null,
                claimedBy: null,
                errorMessage: "Waiting for original sale receipt UUID before return can be prepared",
              },
            });
            return { deferred: true };
          }
          referenceUuid = outcome.uuid;
        }

        const draftWithMeta: EtaReceiptPayload = {
          ...draft,
          receiptUuid: "",
          previousReceiptUuid: previousUUID || undefined,
          referenceReceiptUuid: referenceUuid,
        };

        const buildCtx: EtaWireBuildContext = {
          payload: draftWithMeta,
          previousUUID,
          deviceSerial: locked.serialNumber,
          internalId,
          referenceUuid,
          issuedAt,
        };
        const wire = buildEtaWireReceiptDocument(buildCtx);
        const receiptUuid =
          provider.computeDocumentUuid?.({ ...wire, header: { ...wire.header, uuid: "" } }, previousUUID) ??
          wire.header.uuid;

        if (!receiptUuid) throw new BadRequestException("Provider did not compute receipt UUID");

        wire.header.uuid = receiptUuid;
        assertWireUuidMatchesContentHash(wire);

        const stored: EtaStoredSubmissionPayload = {
          schemaVersion: "eta-wire-v1",
          wireDocument: wire,
          receiptUuid,
          receiptNumber,
        };

        const connection = await resolveEtaConnection(device.credential?.secretRef ?? null);
        const signature = signEtaWireDocument(wire, connection?.signingKey);

        await tx.fiscalSubmission.update({
          where: { id: row.id },
          data: {
            status: FiscalSubmissionStatus.SUBMITTING,
            deviceId: locked.serialNumber,
            receiptNumber,
            payloadJson: stored as unknown as Prisma.InputJsonValue,
            signature,
            errorMessage: null,
            claimedUntil: new Date(Date.now() + CLAIM_MS),
            claimedBy: workerId,
          },
        });

        return {
          submissionId: row.id,
          fiscalDeviceId: row.fiscalDeviceId,
          stored,
          signature,
          resubmission: false,
        };
      },
      { timeout: PREPARE_TX_MS },
    );
  }

  private async finalizeSubmission(
    tenantId: string,
    prepared: PreparedSubmit,
    result: Awaited<ReturnType<typeof submitEtaWireDocument>>,
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
          if (result.failureClass === "credentials") {
            await tx.integrationFailureLog.create({
              data: {
                tenantId,
                clinicId: row.clinicId,
                category: IntegrationFailureCategory.FISCAL,
                operation: "fiscal_submit_credentials",
                operationName: "ETA device credentials expired or invalid",
                statusCode: result.httpStatus ?? 401,
                errorMessage: result.error.slice(0, 2000),
                fingerprint: `fiscal-credentials:${row.fiscalDeviceId}`,
                trace: { steps: [{ step: "submit", ok: false, detail: result.error }] },
              },
            });
            await tx.fiscalDevice.update({
              where: { id: row.fiscalDeviceId },
              data: { status: FiscalDeviceStatus.CREDENTIALS_EXPIRED },
            });
            const backoffMinutes = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
            return tx.fiscalSubmission.update({
              where: { id: row.id },
              data: {
                status: FiscalSubmissionStatus.SUBMITTING,
                errorMessage: result.error.slice(0, 2000),
                submitAttempts: attempts,
                nextRetryAt: new Date(Date.now() + backoffMinutes * 60_000),
                claimedUntil: null,
                claimedBy: null,
                providerValidationStatus: "PENDING",
              },
            });
          }

          if (result.failureClass === "duplicate") {
            const backoffMinutes = Math.max(10, Math.min(60, Math.pow(2, Math.min(attempts, 4))));
            return tx.fiscalSubmission.update({
              where: { id: row.id },
              data: {
                status: FiscalSubmissionStatus.SUBMITTING,
                errorMessage: result.error.slice(0, 2000),
                submitAttempts: attempts,
                nextRetryAt: new Date(Date.now() + backoffMinutes * 60_000),
                claimedUntil: null,
                claimedBy: null,
                providerValidationStatus: "UNKNOWN",
              },
            });
          }

          if (result.failureClass === "permanent") {
            await tx.integrationFailureLog.create({
              data: {
                tenantId,
                clinicId: row.clinicId,
                category: IntegrationFailureCategory.FISCAL,
                operation: "fiscal_submit_rejected",
                operationName: "ETA receipt rejected",
                statusCode: result.httpStatus ?? 400,
                errorMessage: result.error.slice(0, 2000),
                fingerprint: `fiscal-reject:${prepared.submissionId}`,
                trace: { steps: [{ step: "submit", ok: false, detail: result.error }] },
              },
            });
            return tx.fiscalSubmission.update({
              where: { id: row.id },
              data: {
                status: FiscalSubmissionStatus.REJECTED,
                errorMessage: result.error.slice(0, 2000),
                submitAttempts: attempts,
                nextRetryAt: null,
                claimedUntil: null,
                claimedBy: null,
                providerValidationStatus: "INVALID",
              },
            });
          }

          const backoffMinutes = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
          const nextRetryAt =
            result.failureClass === "unclear"
              ? new Date(Date.now() + Math.max(backoffMinutes, 10) * 60_000)
              : new Date(Date.now() + backoffMinutes * 60_000);

          return tx.fiscalSubmission.update({
            where: { id: row.id },
            data: {
              status: FiscalSubmissionStatus.SUBMITTING,
              errorMessage: result.error.slice(0, 2000),
              submitAttempts: attempts,
              nextRetryAt,
              claimedUntil: null,
              claimedBy: null,
              providerValidationStatus: result.failureClass === "unclear" ? "UNKNOWN" : "PENDING",
            },
          });
        }

        const acceptedUuid = result.receiptUuid?.trim() || prepared.stored.receiptUuid;

        await tx.fiscalDevice.update({
          where: { id: row.fiscalDeviceId },
          data: {
            lastReceiptUuid: acceptedUuid,
            receiptSequence: prepared.stored.receiptNumber,
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
            claimedUntil: null,
            claimedBy: null,
            payloadJson: prepared.stored as unknown as Prisma.InputJsonValue,
            providerValidationStatus: "PENDING",
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
    if (!isPreparedSubmit(prepared)) {
      return this.prisma.fiscalSubmission.findFirstOrThrow({ where: { id: submissionId, tenantId } });
    }
    const device = await this.prisma.fiscalDevice.findUniqueOrThrow({
      where: { id: prepared.fiscalDeviceId },
      include: { credential: true },
    });
    const connection = await resolveEtaConnection(device.credential?.secretRef ?? null);

    let result: Awaited<ReturnType<typeof submitEtaWireDocument>>;
    try {
      result = await submitEtaWireDocument(
        prepared.stored.wireDocument,
        prepared.signature,
        connection,
        {
          posSerial: connection?.posSerial?.trim() || device.serialNumber,
          posOsVersion: connection?.posOsVersion,
          posModelFramework: connection?.posModelFramework,
          presharedKey: connection?.presharedKey,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`ETA submit network error for ${submissionId}: ${msg}`);
      result = { ok: false, error: msg, mode: "live", failureClass: "temporary" };
    }

    if (!result.ok && result.failureClass === "duplicate") {
      const validation = await fetchEtaReceiptValidationStatus(
        prepared.stored.receiptUuid,
        connection,
        { posSerial: device.serialNumber },
      );
      if (validation === "VALID") {
        result = {
          ok: true,
          receiptUuid: prepared.stored.receiptUuid,
          mode: "live",
          httpStatus: result.httpStatus,
        };
      }
    }

    const finalized = await this.finalizeSubmission(tenantId, prepared, result);

    if (result.ok && finalized.status === FiscalSubmissionStatus.SUBMITTED) {
      const validation = await fetchEtaReceiptValidationStatus(
        finalized.providerDocumentUuid ?? prepared.stored.receiptUuid,
        connection,
        { posSerial: device.serialNumber },
      );
      if (validation && validation !== "UNKNOWN") {
        await this.prisma.fiscalSubmission.update({
          where: { id: submissionId },
          data: { providerValidationStatus: validation },
        });
      }
    }

    return finalized;
  }

  async resubmitRejected(
    tenantId: string,
    submissionId: string,
    patch: {
      buyerName?: string | null;
      itemCode?: string | null;
      issuerRin?: string | null;
      taxpayerActivityCode?: string | null;
      branchCode?: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.fiscalSubmission.findFirst({
        where: { id: submissionId, tenantId, status: FiscalSubmissionStatus.REJECTED },
        include: { fiscalDocument: true, clinic: { select: { invoiceVatPercent: true } } },
      });
      if (!row?.fiscalDocument) throw new NotFoundException("Rejected fiscal submission not found");

      const priorUuid =
        row.providerDocumentUuid?.trim() ||
        (isEtaStoredSubmissionPayload(row.payloadJson) ? row.payloadJson.receiptUuid : undefined);
      if (!priorUuid) {
        throw new BadRequestException("Rejected submission has no prior receipt UUID to reference");
      }

      const docPayload = row.fiscalDocument.payloadJson as EtaReceiptPayload | null;
      const submissionDraft = row.payloadJson as EtaReceiptPayload | EtaStoredSubmissionPayload | null;
      const draft: EtaReceiptPayload | null =
        docPayload ??
        (submissionDraft && !isEtaStoredSubmissionPayload(submissionDraft) ? submissionDraft : null);

      const vatPercent = draft?.lines?.[0]?.vatPercent ?? Number(row.clinic.invoiceVatPercent ?? 0);
      const description = draft?.lines?.[0]?.description ?? "Medical service";

      const linkedRevenueId = row.fiscalDocument.revenueEntryId;
      let totalAmount = Number(row.fiscalDocument.totalAmount);
      if (linkedRevenueId) {
        const rev = await tx.revenueEntry.findFirst({
          where: { id: linkedRevenueId, tenantId },
          select: { netAmount: true },
        });
        if (rev) totalAmount = Number(rev.netAmount);
      }

      await tx.fiscalDocument.update({
        where: { id: row.fiscalDocumentId },
        data: {
          paymentId: null,
          revenueEntryId: null,
          invoiceId: null,
        },
      });

      await queueFiscalDocument(tx, {
        tenantId: row.tenantId,
        clinicId: row.clinicId,
        patientId: row.patientId,
        totalAmount,
        currency: row.fiscalDocument.currency,
        vatPercent,
        description,
        revenueEntryId: linkedRevenueId ?? undefined,
        paymentId: row.fiscalDocument.paymentId ?? undefined,
        buyerName: patch.buyerName ?? draft?.buyerName,
        clinicTaxRin: patch.issuerRin ?? draft?.issuerRin,
        itemCodeOverride: patch.itemCode,
        taxpayerActivityCodeOverride: patch.taxpayerActivityCode ?? draft?.taxpayerActivityCode,
        branchCodeOverride: patch.branchCode ?? draft?.branchCode,
        referenceReceiptUuid: priorUuid,
        idempotencyKeyOverride: `eta-egypt:resubmit:${submissionId}`,
        resubmitAfterRejection: true,
      });

      return { ok: true, supersededSubmissionId: submissionId, referenceReceiptUuid: priorUuid };
    });
  }
}