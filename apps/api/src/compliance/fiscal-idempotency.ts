import { buildIdempotencyKey } from "./eta-egypt.client";

export type FiscalSourceRef =
  | { kind: "payment"; id: string }
  | { kind: "revenue"; id: string; seq: number }
  | { kind: "invoice"; id: string }
  | { kind: "return"; revenueEntryId: string; seq: number };

export function fiscalSourceRefFromQueue(params: {
  paymentId?: string;
  revenueEntryId?: string;
  invoiceId?: string;
  returnForRevenueEntryId?: string;
}): FiscalSourceRef {
  if (params.returnForRevenueEntryId?.trim()) {
    throw new Error("fiscalSourceRefFromQueue(return) requires fiscal return seq — allocate in queueFiscalDocument");
  }
  if (params.paymentId?.trim()) return { kind: "payment", id: params.paymentId.trim() };
  if (params.revenueEntryId?.trim()) {
    throw new Error("fiscalSourceRefFromQueue(revenue) requires fiscal sale seq — allocate in queueFiscalDocument");
  }
  if (params.invoiceId?.trim()) return { kind: "invoice", id: params.invoiceId.trim() };
  throw new Error("Fiscal queue requires paymentId, revenueEntryId, invoiceId, or returnForRevenueEntryId");
}

/** Stable idempotency key per source payment / revenue / invoice (not amount or description). */
export function buildFiscalIdempotencyKey(providerKey: string, source: FiscalSourceRef): string {
  switch (source.kind) {
    case "payment":
      return buildIdempotencyKey([providerKey, "payment", source.id]);
    case "revenue":
      return buildIdempotencyKey([providerKey, "revenue", source.id, String(source.seq)]);
    case "invoice":
      return buildIdempotencyKey([providerKey, "invoice", source.id]);
    case "return":
      return buildIdempotencyKey([providerKey, "return", source.revenueEntryId, String(source.seq)]);
  }
}

export function buildRevenueSaleIdempotencyKey(providerKey: string, revenueEntryId: string, seq: number): string {
  return buildFiscalIdempotencyKey(providerKey, { kind: "revenue", id: revenueEntryId, seq });
}

export function buildRevenueReturnIdempotencyKey(providerKey: string, revenueEntryId: string, seq: number): string {
  return buildFiscalIdempotencyKey(providerKey, { kind: "return", revenueEntryId, seq });
}