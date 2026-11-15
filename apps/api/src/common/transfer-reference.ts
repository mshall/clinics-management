import { BadRequestException } from "@nestjs/common";
import { MoneyTransferChannel } from "@prisma/client";

/** InstaPay references: typically 6–32 alphanumeric characters. */
const INSTAPAY_REF = /^[A-Za-z0-9][A-Za-z0-9\-_.]{5,31}$/;

/** Fawry payment references: numeric or alphanumeric, 8–20 chars. */
const FAWRY_REF = /^[A-Za-z0-9]{8,20}$/;

export function assertValidTransferReference(channel: MoneyTransferChannel, reference: string): void {
  const ref = reference.trim();
  if (channel === MoneyTransferChannel.INSTAPAY) {
    if (!INSTAPAY_REF.test(ref)) {
      throw new BadRequestException({
        message: "Invalid InstaPay transaction ID format",
        messageKey: "errors.transfer.invalidInstapay",
      });
    }
    return;
  }
  if (channel === MoneyTransferChannel.FAWRY) {
    if (!FAWRY_REF.test(ref)) {
      throw new BadRequestException({
        message: "Invalid Fawry reference format",
        messageKey: "errors.transfer.invalidFawry",
      });
    }
    return;
  }
  throw new BadRequestException("Select InstaPay or Fawry for money transfer");
}

/**
 * Online verification against provider APIs — returns true when matched or when verification is skipped (no API configured).
 */
export async function verifyTransferReferenceWithProvider(
  channel: MoneyTransferChannel,
  reference: string,
  expectedAmount: number,
  currency: string,
): Promise<{ verified: boolean; skipped: boolean; detail?: string }> {
  const verifyUrl =
    channel === MoneyTransferChannel.INSTAPAY
      ? process.env.INSTAPAY_VERIFY_URL?.trim()
      : process.env.FAWRY_VERIFY_URL?.trim();
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