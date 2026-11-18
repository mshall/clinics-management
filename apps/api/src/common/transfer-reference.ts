import { BadRequestException } from "@nestjs/common";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";
import { paymentMethodForTransferChannel } from "../markets/market-payment-methods";

export function assertValidTransferReference(
  channel: string,
  reference: string,
  methods: MarketPaymentMethodDef[] = [],
): void {
  const ref = reference.trim();
  const normalized = channel.trim().toUpperCase();
  const def = paymentMethodForTransferChannel(methods, normalized);
  if (!def?.referencePattern) {
    if (ref.length < 3) throw transferReferenceError("TRANSFER_REFERENCE_REQUIRED", normalized, "Transaction reference is too short");
    return;
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(def.referencePattern);
  } catch {
    throw new BadRequestException("Invalid transfer reference pattern in market configuration");
  }
  if (!pattern.test(ref)) {
    throw transferReferenceError("TRANSFER_REFERENCE_FORMAT", normalized, `Invalid ${normalized} reference format`);
  }
}

export type TransferReferenceErrorCode =
  | "TRANSFER_REFERENCE_REQUIRED"
  | "TRANSFER_REFERENCE_FORMAT"
  | "TRANSFER_REFERENCE_NOT_VERIFIED";

/** 400 body the front desk can pin to the transaction-ID field (`field`) and localize (`messageKey` + `channel`). */
export function transferReferenceError(
  errorCode: TransferReferenceErrorCode,
  channel: string,
  message: string,
): BadRequestException {
  const keys: Record<TransferReferenceErrorCode, string> = {
    TRANSFER_REFERENCE_REQUIRED: "errors.transfer.referenceRequired",
    TRANSFER_REFERENCE_FORMAT: "errors.transfer.referenceFormat",
    TRANSFER_REFERENCE_NOT_VERIFIED: "errors.transfer.notVerified",
  };
  return new BadRequestException({
    message,
    errorCode,
    field: "transferReference",
    messageKey: keys[errorCode],
    messageParams: { channel },
  });
}

/**
 * Online verification against provider APIs — returns true when matched or when verification is skipped (no API configured).
 */
export async function verifyTransferReferenceWithProvider(
  channel: string,
  reference: string,
  expectedAmount: number,
  currency: string,
  methods: MarketPaymentMethodDef[] = [],
): Promise<{ verified: boolean; skipped: boolean; detail?: string }> {
  const def = paymentMethodForTransferChannel(methods, channel);
  const envName = def?.verifyUrlEnv?.trim();
  const verifyUrl = envName ? process.env[envName]?.trim() : undefined;
  if (!verifyUrl) {
    return { verified: false, skipped: true, detail: "Provider verification API not configured" };
  }
  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ channel, reference, expectedAmount, currency }),
    });
    if (!res.ok) {
      return { verified: false, skipped: false, detail: `Provider responded ${res.status}` };
    }
    const body = (await res.json()) as { matched?: boolean };
    return { verified: Boolean(body.matched), skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { verified: false, skipped: false, detail: msg };
  }
}