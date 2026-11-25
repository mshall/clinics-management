export const COMMISSION_CHARGE_CREATED = "COMMISSION_CHARGE_CREATED";
export const COMMISSION_CHARGE_REVERSED = "COMMISSION_CHARGE_REVERSED";
/** GRW-P1-D2 (contracts 1.10.0): a charge was waived or changed, with the decision that explains it. Aggregate type Appointment. */
export const COMMISSION_ADJUSTED = "CommissionAdjusted";
/** COM-1 (additive): a charge changed status without being reversed (confirmed, disputed, dispute rejected). Payload as COMMISSION_CHARGE_CREATED plus tenantId, clinicId, decisionAmount, disputeDeadline, disputeStatus. */
export const COMMISSION_CHARGE_STATUS_CHANGED = "COMMISSION_CHARGE_STATUS_CHANGED";
