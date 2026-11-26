import type { DunningTimelineConfig } from "../subscriptions/dunning-config";
import { effectiveRateAt, NO_RATE_PARAMS, rateParamsOf, type RateHistoryRow, type RateParams } from "./commission-rate-view";

/**
 * COM-3: the collection parameters Kiorex configures on the rate row (reminderDays, graceDays, retryDays, invoiceDueDays, disputeWindowDays, savedMethodChargeAllowed) replace the Clinic's
 * built-in defaults WHEN PRESENT; an absent value keeps the current default. Pure functions here, one tiny loader below. SB-05 is untouched: no parameter can pause or hide the listing
 * (there is no such setting), an unpaid commission only runs the reminders and the invoice / retry timeline.
 */
type Reader = { kiorexCommissionRateView: { findUnique(a: { where: { tenantId: string }; select: { view: true } }): Promise<{ view: unknown } | null> } };

export async function loadRateParams(db: Reader, tenantId: string, at: Date = new Date()): Promise<RateParams> {
  try {
    const row = await db.kiorexCommissionRateView.findUnique({ where: { tenantId }, select: { view: true } });
    const history = (row?.view as { history?: RateHistoryRow[] } | null)?.history;
    if (!Array.isArray(history)) return NO_RATE_PARAMS;
    const eff = effectiveRateAt(history, at);
    return eff.state === "SET" ? rateParamsOf(eff.spec) : NO_RATE_PARAMS;
  } catch {
    return NO_RATE_PARAMS;
  }
}

/** Reminders: the platform counts days relative to the due date (negative = before); the Clinic timeline counts days BEFORE due (3 = three days before, 0 = on the due date). Days after the due date are not reminders of this timeline and are left out. */
export function applyRateToDunning(base: DunningTimelineConfig, p: RateParams): DunningTimelineConfig {
  const reminders = p.reminderDays ? p.reminderDays.filter((d) => d <= 0).map((d) => (d === 0 ? 0 : -d)).sort((a, b) => b - a) : null;
  const graceEndDay = p.graceDays ?? base.graceEndDay;
  return {
    ...base,
    reminderDaysBeforeDue: reminders && reminders.length > 0 ? reminders : base.reminderDaysBeforeDue,
    graceEndDay,
    readOnlyFromDay: Math.max(base.readOnlyFromDay, graceEndDay + 1),
    suspendedFromDay: Math.max(base.suspendedFromDay, graceEndDay + 2, base.readOnlyFromDay),
  };
}
export const invoiceDueDaysWith = (base: number, p: RateParams): number => p.invoiceDueDays ?? base;
export const autoChargeRetryDaysWith = (base: readonly number[], p: RateParams): readonly number[] => p.retryDays ?? base;
/** false only when Kiorex says a saved-method (token) charge is not permitted; absent = permitted as today. A refused charge falls back to the invoice. */
export const savedMethodChargeAllowedWith = (p: RateParams): boolean => p.savedMethodChargeAllowed !== false;
export const disputeWindowDaysWith = (base: number, p: RateParams): number => p.disputeWindowDays ?? base;
