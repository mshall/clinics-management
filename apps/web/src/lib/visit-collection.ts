export type VisitCollectionMode = "CASH_ON_VISIT" | "MONEY_TRANSFER";
export type MoneyTransferChannel = "INSTAPAY" | "FAWRY";

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
  if (collection.transferChannel !== "INSTAPAY" && collection.transferChannel !== "FAWRY") {
    return t("visitCollection.channelRequired", "Select InstaPay or Fawry.");
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