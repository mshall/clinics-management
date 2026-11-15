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
    if (ref.length < 3) {
      throw new BadRequestException("Transaction reference is too short");
    }
    return;
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(def.referencePattern);
  } catch {
    throw new BadRequestException("Invalid transfer reference pattern in market configuration");
  }
  if (!pattern.test(ref)) {
    throw new BadRequestException({
      message: `Invalid ${normalized} reference format`,
      messageKey: `errors.transfer.invalid${normalized.charAt(0)}${normalized.slice(1).toLowerCase()}`,
    });
  }
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