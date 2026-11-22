/**
 * Fee fields on appointment update are applied only when the actor may edit fees.
 * Call center (and other non-fee roles) often receive redacted feeAmount: 0 in DTOs;
 * ignoring their fee payload lets status changes (e.g. check-in) succeed without
 * wiping or "editing" scheduled fees.
 */
export function resolveAppointmentFeeUpdateIntent(
  canSetFees: boolean,
  dto: { feeAmount?: number | null; scheduledFeeCollection?: unknown },
): { applyFeeAmount: boolean; applyScheduled: boolean } {
  if (!canSetFees) {
    return { applyFeeAmount: false, applyScheduled: false };
  }
  return {
    applyFeeAmount: dto.feeAmount !== undefined && dto.feeAmount !== null,
    applyScheduled: dto.scheduledFeeCollection !== undefined,
  };
}
