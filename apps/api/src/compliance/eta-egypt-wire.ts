import type { EtaReceiptPayload } from "./eta-egypt.client";

/** ETA e-Receipt wire document (header uuid / previousUUID chain per POS device). */
export type EtaWireReceiptDocument = {
  documentType: string;
  header: {
    dateTimeIssued: string;
    receiptNumber: string;
    uuid: string;
    previousUUID: string;
    currency: string;
    exchangeRate: number;
  };
  seller: {
    rin: string;
    branchCode: string;
    activityCode: string;
  };
  itemData: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    itemCode?: string;
  }>;
  totalSales: number;
  documentNature: "sale" | "return";
  netAmount: number;
};

export function buildEtaWireReceiptDocument(payload: EtaReceiptPayload): EtaWireReceiptDocument {
  const itemData = payload.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.quantity * line.unitPrice,
    ...(line.itemCode ? { itemCode: line.itemCode } : {}),
  }));
  return {
    documentType: "r",
    header: {
      dateTimeIssued: new Date().toISOString(),
      receiptNumber: payload.idempotencyKey.slice(-32),
      uuid: payload.receiptUuid,
      previousUUID: payload.previousReceiptUuid ?? "",
      currency: payload.currency,
      exchangeRate: 0,
    },
    seller: {
      rin: payload.issuerRin,
      branchCode: payload.branchCode,
      activityCode: payload.taxpayerActivityCode,
    },
    itemData,
    totalSales: payload.totalAmount,
    documentNature: payload.documentNature,
    netAmount: payload.totalAmount,
  };
}