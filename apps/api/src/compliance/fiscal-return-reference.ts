import { FiscalSubmissionStatus, type Prisma } from "@prisma/client";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { isEtaStoredSubmissionPayload } from "./eta-stored-submission";

/** UUID of the sale receipt to reference on a return (provider id or prepared wire uuid). */
export function saleReferenceUuidFromSubmission(sub: {
  status: FiscalSubmissionStatus;
  providerDocumentUuid: string | null;
  payloadJson: unknown;
} | null | undefined): string | undefined {
  if (!sub) return undefined;
  const provider = sub.providerDocumentUuid?.trim();
  if (provider) return provider;
  if (isEtaStoredSubmissionPayload(sub.payloadJson)) {
    return sub.payloadJson.receiptUuid?.trim() || undefined;
  }
  const draft = sub.payloadJson as EtaReceiptPayload | null;
  if (draft && typeof draft === "object" && draft.receiptUuid?.trim()) {
    return draft.receiptUuid.trim();
  }
  if (
    sub.status === FiscalSubmissionStatus.SUBMITTING ||
    sub.status === FiscalSubmissionStatus.SUBMITTED ||
    sub.status === FiscalSubmissionStatus.ACCEPTED
  ) {
    return undefined;
  }
  return undefined;
}

export async function resolveSaleReferenceUuid(
  tx: Prisma.TransactionClient,
  saleFiscalDocumentId: string,
): Promise<string | undefined> {
  const sale = await tx.fiscalDocument.findFirst({
    where: { id: saleFiscalDocumentId },
    include: { submission: true },
  });
  return saleReferenceUuidFromSubmission(sale?.submission ?? null);
}