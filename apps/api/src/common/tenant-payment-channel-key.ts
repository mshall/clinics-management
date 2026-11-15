import { BadRequestException } from "@nestjs/common";

/** Stable transfer channel id from a human-readable channel name (unique per tenant). */
export function channelKeyFromPaymentChannelName(name: string, existingKeys: Iterable<string>): string {
  const trimmed = name.trim();
  if (!trimmed) throw new BadRequestException("Payment channel name is required");
  let base = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  if (!base) throw new BadRequestException("Payment channel name must contain letters or numbers");
  if (/^\d/.test(base)) base = `CH_${base}`.slice(0, 28);

  const taken = new Set([...existingKeys].map((k) => k.toUpperCase()));
  let key = base;
  let n = 2;
  while (taken.has(key)) {
    const suffix = `_${n++}`;
    key = `${base.slice(0, Math.max(4, 28 - suffix.length))}${suffix}`;
  }
  return key;
}

export function assertPaymentChannelContactFields(accountNumber?: string | null, mobileNumber?: string | null): void {
  const acct = accountNumber?.trim() ?? "";
  const mobile = mobileNumber?.trim() ?? "";
  if (!acct && !mobile) {
    throw new BadRequestException("Provide an account number and/or a mobile number for this payment channel");
  }
}