import { buildIdempotencyKey } from "./eta-egypt.client";

export type FiscalSourceRef =
  | { kind: "payment"; id: string }
  | { kind: "revenue"; id: string }
  | { kind: "invoice"; id: string }
  | { kind: "return"; revenueEntryId: string };

export function fiscalSourceRefFromQueue(params: {
  paymentId?: string;
  revenueEntryId?: string;
  invoiceId?: string;
  returnForRevenueEntryId?: string;
}): FiscalSourceRef {
  if (params.returnForRevenueEntryId?.trim()) {
    return { kind: "return", revenueEntryId: params.returnForRevenueEntryId.trim() };
  }
  if (params.paymentId?.trim()) return { kind: "payment", id: params.paymentId.trim() };
  if (params.revenueEntryId?.trim()) return { kind: "revenue", id: params.revenueEntryId.trim() };
  if (params.invoiceId?.trim()) return { kind: "invoice", id: params.invoiceId.trim() };
  throw new Error("Fiscal queue requires paymentId, revenueEntryId, invoiceId, or returnForRevenueEntryId");
}

/** Stable idempotency key per source payment / revenue / invoice (not amount or description). */
export function buildFiscalIdempotencyKey(providerKey: string, source: FiscalSourceRef): string {
  switch (source.kind) {
    case "payment":
      return buildIdempotencyKey([providerKey, "payment", source.id]);
    case "revenue":
      return buildIdempotencyKey([providerKey, "revenue", source.id]);
    case "invoice":
      return buildIdempotencyKey([providerKey, "invoice", source.id]);
    case "return":
      return buildIdempotencyKey([providerKey, "return", source.revenueEntryId]);
  }
}