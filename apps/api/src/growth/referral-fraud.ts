export type ReferralFraudInput = {
  referrerOwnerPhone: string | null;
  referredOwnerPhone: string | null;
  referrerNationalId: string | null;
  referredNationalId: string | null;
  sharedPaymentFingerprint: boolean;
};

export function referralFraudRejectReason(input: ReferralFraudInput): string | null {
  if (input.referrerOwnerPhone && input.referredOwnerPhone) {
    const a = input.referrerOwnerPhone.replace(/\D/g, "");
    const b = input.referredOwnerPhone.replace(/\D/g, "");
    if (a.length >= 8 && a === b) return "SAME_PHONE";
  }
  if (input.referrerNationalId && input.referredNationalId) {
    if (input.referrerNationalId.trim() === input.referredNationalId.trim()) return "SAME_NATIONAL_ID";
  }
  if (input.sharedPaymentFingerprint) return "SHARED_PAYMENT_METHOD";
  return null;
}