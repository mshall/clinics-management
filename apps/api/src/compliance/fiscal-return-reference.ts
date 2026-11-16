import { FiscalSubmissionStatus, type Prisma } from "@prisma/client";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { isEtaStoredSubmissionPayload } from "./eta-stored-submission";

type SubmissionRef = {
  status: FiscalSubmissionStatus;
  providerDocumentUuid: string | null;
  payloadJson: unknown;
};

/** UUID of an accepted sale receipt to reference on a return (not in-flight or rejected sales). */
export function saleReferenceUuidFromSubmission(sub: SubmissionRef | null | undefined): string | undefined {
  if (!sub) return undefined;
  if (
    sub.status !== FiscalSubmissionStatus.SUBMITTED &&
    sub.status !== FiscalSubmissionStatus.ACCEPTED
  ) {
    return undefined;
  }
  const provider = sub.providerDocumentUuid?.trim();
  if (provider) return provider;
  if (isEtaStoredSubmissionPayload(sub.payloadJson)) {
    return sub.payloadJson.receiptUuid?.trim() || undefined;
  }
  const draft = sub.payloadJson as EtaReceiptPayload | null;
  if (draft && typeof draft === "object" && draft.receiptUuid?.trim()) {
    return draft.receiptUuid.trim();
  }
  return undefined;
}

export type SaleReturnPrepareOutcome =
  | { action: "reference"; uuid: string }
  | { action: "wait" }
  | { action: "cancel"; reason: string };

export function saleReturnPrepareOutcomeFromSubmission(
  sub: SubmissionRef | null | undefined,
): SaleReturnPrepareOutcome {
  if (!sub) {
    return { action: "cancel", reason: "Original sale fiscal submission not found" };
  }
  if (
    sub.status === FiscalSubmissionStatus.REJECTED ||
    sub.status === FiscalSubmissionStatus.CANCELLED
  ) {
    return { action: "cancel", reason: "Original sale was rejected or cancelled" };
  }
  if (
    sub.status === FiscalSubmissionStatus.PENDING ||
    sub.status === FiscalSubmissionStatus.SUBMITTING
  ) {
    return { action: "wait" };
  }
  const uuid = saleReferenceUuidFromSubmission(sub);
  if (uuid) return { action: "reference", uuid };
  return { action: "wait" };
}

export async function resolveSaleReturnPrepareOutcome(
  tx: Prisma.TransactionClient,
  saleFiscalDocumentId: string,
): Promise<SaleReturnPrepareOutcome> {
  const sale = await tx.fiscalDocument.findFirst({
    where: { id: saleFiscalDocumentId },
    include: { submission: true },
  });
  return saleReturnPrepareOutcomeFromSubmission(sale?.submission ?? null);
}

/** @deprecated use resolveSaleReturnPrepareOutcome */
export async function resolveSaleReferenceUuid(
  tx: Prisma.TransactionClient,
  saleFiscalDocumentId: string,
): Promise<string | undefined> {
  const outcome = await resolveSaleReturnPrepareOutcome(tx, saleFiscalDocumentId);
  return outcome.action === "reference" ? outcome.uuid : undefined;
}