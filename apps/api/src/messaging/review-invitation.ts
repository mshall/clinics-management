import { AppointmentStatus, BookingSource } from "@prisma/client";

/** Patients who booked through Kiorex (marketplace, WhatsApp, clinic link) have a Kiorex account to review from. */
const REVIEWABLE_SOURCES = new Set<BookingSource>([
  BookingSource.KIOREX_MARKETPLACE,
  BookingSource.KIOREX_WHATSAPP,
  BookingSource.CLINIC_LINK,
]);

/** KX-08: only a completed visit earns a review invitation — never no-shows or cancellations. */
export function isReviewInvitationEligible(nextStatus: AppointmentStatus, bookingSource: BookingSource): boolean {
  return nextStatus === AppointmentStatus.COMPLETED && REVIEWABLE_SOURCES.has(bookingSource);
}
