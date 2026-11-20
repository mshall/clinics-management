import type { TranslateFn } from "@/lib/translate-fn";

export type VisitCollectionMode = "CASH_ON_VISIT" | "MONEY_TRANSFER";

/** Market-defined transfer channel id (e.g. INSTAPAY, FAWRY). */
export type MoneyTransferChannel = string;

export type VisitCollectionValue = {
  mode: VisitCollectionMode;
  transferChannel?: MoneyTransferChannel | "";
  transferReference?: string;
};

export const emptyVisitCollection = (): VisitCollectionValue => ({
  mode: "CASH_ON_VISIT",
  transferChannel: "",
  transferReference: "",
});

export type ScheduledFeeCollectionValue = {
  mode: VisitCollectionMode;
  transferChannel?: MoneyTransferChannel | "";
};

export const emptyScheduledFeeCollection = (): ScheduledFeeCollectionValue => ({
  mode: "CASH_ON_VISIT",
  transferChannel: "",
});

export function validateScheduledFeeCollection(
  feeAmount: number,
  plan: ScheduledFeeCollectionValue,
  t: (key: string, fallback: string) => string,
): string | null {
  if (feeAmount <= 0) return null;
  if (plan.mode === "CASH_ON_VISIT") return null;
  if (plan.mode !== "MONEY_TRANSFER") {
    return t("visitCollection.invalidMode", "Choose how payment will be collected.");
  }
  if (!plan.transferChannel?.trim()) {
    return t("visitCollection.channelRequired", "Select a transfer channel.");
  }
  return null;
}

export function scheduledFeeCollectionToApi(
  feeAmount: number,
  plan: ScheduledFeeCollectionValue,
): Record<string, unknown> | undefined {
  if (feeAmount <= 0) return undefined;
  if (plan.mode === "CASH_ON_VISIT") return { mode: "CASH_ON_VISIT" };
  return {
    mode: "MONEY_TRANSFER",
    transferChannel: plan.transferChannel,
  };
}

/** Market / org payment method with an optional reference regex (same source the API validates against). */
export type TransferReferenceRule = { transferChannel?: string; channelKey?: string; referencePattern?: string | null };

export type TransferReferenceIssue = "required" | "format" | null;

/** Mirrors the API's `assertValidTransferReference` so the desk sees the problem before submitting. */
export function transferReferenceIssue(
  channel: string,
  reference: string,
  rules: TransferReferenceRule[] = [],
): TransferReferenceIssue {
  const ref = reference.trim();
  if (ref.length < 3) return "required";
  const ch = channel.trim().toUpperCase();
  const rule = rules.find((r) => (r.transferChannel ?? r.channelKey ?? "").toUpperCase() === ch);
  if (!rule?.referencePattern) return null;
  try {
    return new RegExp(rule.referencePattern).test(ref) ? null : "format";
  } catch {
    return null;
  }
}

export function transferReferenceMessage(
  issue: Exclude<TransferReferenceIssue, null>,
  channelLabel: string,
  t: TranslateFn,
): string {
  return issue === "required"
    ? t("visitCollection.transactionIdRequired", "Enter the transfer transaction ID.")
    : t("errors.transfer.referenceFormat", "This doesn't look like a {{channel}} reference. Check the receipt and try again.", {
        channel: channelLabel,
      });
}

export function validateVisitCollection(
  amount: number,
  collection: VisitCollectionValue,
  t: TranslateFn,
  rules: TransferReferenceRule[] = [],
): string | null {
  if (amount <= 0) return null;
  if (collection.mode === "CASH_ON_VISIT") return null;
  if (collection.mode !== "MONEY_TRANSFER") {
    return t("visitCollection.invalidMode", "Choose how payment was collected.");
  }
  const channel = collection.transferChannel?.trim();
  if (!channel) {
    return t("visitCollection.channelRequired", "Select a transfer channel.");
  }
  const issue = transferReferenceIssue(channel, collection.transferReference ?? "", rules);
  return issue ? transferReferenceMessage(issue, channel, t) : null;
}

/** True when an API error belongs on the transaction-ID field rather than in a toast. */
export function isTransferReferenceApiError(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { field?: unknown }).field === "transferReference");
}

export function visitCollectionToApi(
  amount: number,
  collection: VisitCollectionValue,
): Record<string, unknown> | undefined {
  if (amount <= 0) return undefined;
  if (collection.mode === "CASH_ON_VISIT") {
    return { mode: "CASH_ON_VISIT" };
  }
  return {
    mode: "MONEY_TRANSFER",
    transferChannel: collection.transferChannel,
    transferReference: collection.transferReference?.trim(),
  };
}