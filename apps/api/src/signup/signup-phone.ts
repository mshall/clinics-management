import { BadRequestException } from "@nestjs/common";
import { normalizePhoneDigits } from "../patients/patient-phone";

export const SIGNUP_OTP_PURPOSE = "SIGNUP";

export function normalizeSignupPhone(raw: string, defaultCountryCallingCode = "20"): string {
  const digits = normalizePhoneDigits(raw);
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException("Enter a valid mobile number");
  }
  let normalized = digits;
  if (normalized.startsWith("0")) {
    normalized = `${defaultCountryCallingCode}${normalized.slice(1)}`;
  }
  if (!normalized.startsWith(defaultCountryCallingCode) && normalized.length === 10) {
    normalized = `${defaultCountryCallingCode}${normalized}`;
  }
  return normalized;
}