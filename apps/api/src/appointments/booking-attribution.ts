import { AcquisitionOrigin, BookingSource } from "@prisma/client";

/** Kiorex / integration attribution payload (search id, campaign, landing page). */
export type BookingAttributionJson = {
  searchId?: string;
  campaign?: string;
  landingPage?: string;
  [key: string]: unknown;
};

const KIOREX_SOURCES = new Set<BookingSource>([
  BookingSource.KIOREX_MARKETPLACE,
  BookingSource.KIOREX_WHATSAPP,
]);

/**
 * Commission chargeability (CR-06): clinic-owned booking links are never chargeable.
 * GRW-P1-D2: an optional third parameter carries the Kiorex attribution origin. PROVIDER_LED is one more way to be non-chargeable; MARKETPLACE,
 * UNATTRIBUTED, null and undefined all keep today's rules, so evidence can only REMOVE a fee, never add one.
 */
export function isCommissionChargeableBooking(
  bookingSource: BookingSource,
  isNewPatientAtBooking: boolean | null | undefined,
  acquisitionOrigin?: AcquisitionOrigin | null,
): boolean {
  if (acquisitionOrigin === AcquisitionOrigin.PROVIDER_LED) return false;
  if (bookingSource === BookingSource.CLINIC_LINK) return false;
  if (!isNewPatientAtBooking) return false;
  return KIOREX_SOURCES.has(bookingSource) || bookingSource === BookingSource.INTEGRATION;
}

export function defaultBookingSourceForIntegration(input: {
  marketplaceConsentGranted?: boolean;
  kiorexChannel?: "marketplace" | "whatsapp";
}): BookingSource {
  if (input.marketplaceConsentGranted || input.kiorexChannel === "marketplace") {
    return BookingSource.KIOREX_MARKETPLACE;
  }
  if (input.kiorexChannel === "whatsapp") {
    return BookingSource.KIOREX_WHATSAPP;
  }
  return BookingSource.INTEGRATION;
}