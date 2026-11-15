import type { Prisma } from "@prisma/client";

export type FiscalProviderKey = "eta-egypt" | string;

export type FiscalPayloadBuildContext = {
  tenantId: string;
  clinicId: string;
  patientId: string;
  totalAmount: number;
  currency: string;
  vatPercent: number;
  description: string;
  taxConfig: Record<string, unknown>;
  clinicOverrides: Record<string, unknown>;
  idempotencyKey: string;
  /** ETA receipt UUID — empty while queued; computed at submit from receipt content + POS chain. */
  receiptUuid: string;
  /** Return receipts: UUID of the original sale receipt (referenceUUID). */
  referenceReceiptUuid?: string;
  documentNature?: "sale" | "return";
};

export type BuiltFiscalPayload = {
  payloadJson: Prisma.InputJsonValue;
  schemaVersion: string;
  signature: string;
  idempotencyKey: string;
};

export type FiscalSubmitResult =
  | { ok: true; providerDocumentUuid: string; mode: "live" | "sandbox" }
  | { ok: false; error: string; mode: "unconfigured" | "live" };

export interface FiscalProvider {
  readonly key: FiscalProviderKey;
  readonly settingsSchema: Record<string, unknown>;
  buildPayload(ctx: FiscalPayloadBuildContext): BuiltFiscalPayload;
  submit(payload: unknown, signature: string, secretRef?: string | null): Promise<FiscalSubmitResult>;
}