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

export function validateVisitCollection(
  amount: number,
  collection: VisitCollectionValue,
  t: (key: string, fallback: string) => string,
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
  const ref = collection.transferReference?.trim() ?? "";
  if (ref.length < 3) {
    return t("visitCollection.transactionIdRequired", "Enter the transfer transaction ID.");
  }
  return null;
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