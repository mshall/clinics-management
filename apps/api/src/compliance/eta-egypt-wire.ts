import type { EtaReceiptPayload } from "./eta-egypt.client";

/** ETA e-Receipt v1.2 wire document (uuid chain per POS device at submit time). */
export type EtaWireReceiptDocument = {
  documentType: string;
  documentTypeVersion: string;
  dateTimeIssued: string;
  taxpayerActivityCode: string;
  internalID: string;
  deviceSerialNumber: string;
  seller: {
    rin: string;
    branchCode: string;
    branchAddress: { country: string; governate: string; regionCity: string; street: string; buildingNumber: string };
    activityCode: string;
  };
  buyer: {
    type: string;
    name: string;
  };
  itemData: Array<{
    internalCode: string;
    description: string;
    itemType: string;
    itemCode: string;
    unitType: string;
    quantity: number;
    unitPrice: number;
    netSale: number;
    totalSale: number;
    total: number;
    taxableItems: Array<{ taxType: string; amount: number; subType: string; rate: number }>;
  }>;
  totalSalesAmount: number;
  totalDiscountAmount: number;
  netAmount: number;
  feesAmount: number;
  totalAmount: number;
  taxTotals: Array<{ taxType: string; amount: number }>;
  paymentMethod: string;
  header: {
    dateTimeIssued: string;
    receiptNumber: string;
    uuid: string;
    previousUUID: string;
    referenceUUID?: string;
    /** Correction resend after a rejected receipt (Receipt v1.2). */
    referenceOldUUID?: string;
    currency: string;
    exchangeRate: number;
  };
  documentNature: "sale" | "return";
};

export type EtaWireBuildContext = {
  payload: EtaReceiptPayload;
  previousUUID: string;
  deviceSerial: string;
  internalId: string;
  referenceUuid?: string;
  /** Freeze issue time at prepare (tests pass a fixed timestamp). */
  issuedAt?: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildEtaWireReceiptDocument(ctx: EtaWireBuildContext): EtaWireReceiptDocument {
  const payload = ctx.payload;
  const vatPercent = payload.lines[0]?.vatPercent ?? 0;
  const netAmount = roundMoney(payload.totalAmount);
  const taxAmount = roundMoney((netAmount * vatPercent) / (100 + vatPercent));
  const netSale = roundMoney(netAmount - taxAmount);
  const itemCode = payload.lines[0]?.itemCode?.trim() || "EG-8690000000001";
  const issued = ctx.issuedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const receiptNumber = ctx.internalId.replace(/[^A-Za-z0-9]/g, "").slice(-50) || ctx.internalId.slice(-12);
  const paymentMethod = payload.paymentMethod?.trim() || "C";
  const isReturn = payload.documentNature === "return";

  const itemData = payload.lines.map((line, idx) => {
    const lineNet = roundMoney(line.quantity * line.unitPrice);
    const lineTax = roundMoney((lineNet * line.vatPercent) / (100 + line.vatPercent));
    const lineNetSale = roundMoney(lineNet - lineTax);
    return {
      internalCode: `LINE-${idx + 1}`,
      description: line.description,
      itemType: "EGS",
      itemCode: line.itemCode?.trim() || itemCode,
      unitType: "EA",
      quantity: line.quantity,
      unitPrice: roundMoney(line.unitPrice),
      netSale: lineNetSale,
      totalSale: lineNet,
      total: lineNet,
      taxableItems:
        line.vatPercent > 0
          ? [{ taxType: "T1", amount: lineTax, subType: "V001", rate: line.vatPercent }]
          : [{ taxType: "T0", amount: 0, subType: "V009", rate: 0 }],
    };
  });

  const header: EtaWireReceiptDocument["header"] = {
    dateTimeIssued: issued,
    receiptNumber,
    uuid: payload.receiptUuid?.trim() || "",
    previousUUID: ctx.previousUUID,
    currency: payload.currency,
    exchangeRate: payload.currency === "EGP" ? 0 : payload.exchangeRate ?? 0,
    ...(isReturn && ctx.referenceUuid ? { referenceUUID: ctx.referenceUuid } : {}),
    ...(!isReturn && ctx.referenceUuid ? { referenceOldUUID: ctx.referenceUuid } : {}),
  };

  return {
    documentType: isReturn ? "R" : "R",
    documentTypeVersion: "1.2",
    dateTimeIssued: issued,
    taxpayerActivityCode: payload.taxpayerActivityCode,
    internalID: ctx.internalId.slice(0, 50),
    deviceSerialNumber: ctx.deviceSerial,
    seller: {
      rin: payload.issuerRin,
      branchCode: payload.branchCode,
      branchAddress: {
        country: "EG",
        governate: "Cairo",
        regionCity: "Cairo",
        street: "N/A",
        buildingNumber: "0",
      },
      activityCode: payload.taxpayerActivityCode,
    },
    buyer: {
      type: "P",
      name: payload.buyerName?.trim() || "Patient",
    },
    itemData,
    totalSalesAmount: netAmount,
    totalDiscountAmount: 0,
    netAmount: netSale,
    feesAmount: 0,
    totalAmount: netAmount,
    taxTotals: vatPercent > 0 ? [{ taxType: "T1", amount: taxAmount }] : [{ taxType: "T0", amount: 0 }],
    paymentMethod,
    header,
    documentNature: isReturn ? "return" : "sale",
  };
}