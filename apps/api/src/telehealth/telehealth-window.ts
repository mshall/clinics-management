/**
 * ADR-039 join window. NEVER stored and NEVER inside the link token: it is computed at join time from the appointment's
 * CURRENT start/end, so a reschedule moves the window automatically and the link does not change.
 */
export const JOIN_OPENS_BEFORE_MS = 10 * 60_000;
export const JOIN_CLOSES_AFTER_END_MS = 60 * 60_000;
const DEFAULT_DURATION_MS = 30 * 60_000;
/** A participant counts as present while a poll/heartbeat arrived this recently. */
export const PRESENCE_TTL_MS = 20_000;
/** Both present continuously for this long = attended (billing + check-in + encounter). Test override: TELEHEALTH_ATTENDANCE_SECONDS. */
export function attendanceThresholdMs(): number {
  const s = Number(process.env.TELEHEALTH_ATTENDANCE_SECONDS);
  return Number.isFinite(s) && s > 0 ? s * 1000 : 3 * 60_000;
}

export type JoinWindow = { opensAt: Date; closesAt: Date; scheduledEnd: Date };
export type WindowState = "TOO_EARLY" | "OPEN" | "EXPIRED";

export function joinWindow(startsAt: Date, endsAt: Date | null): JoinWindow {
  const scheduledEnd = endsAt && endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + DEFAULT_DURATION_MS);
  return {
    opensAt: new Date(startsAt.getTime() - JOIN_OPENS_BEFORE_MS),
    closesAt: new Date(scheduledEnd.getTime() + JOIN_CLOSES_AFTER_END_MS),
    scheduledEnd,
  };
}

export function windowState(now: Date, w: JoinWindow): WindowState {
  if (now < w.opensAt) return "TOO_EARLY";
  if (now > w.closesAt) return "EXPIRED";
  return "OPEN";
}

/** Not attended `noShowMinutes` after the scheduled start. */
export function isPastNoShowDeadline(now: Date, startsAt: Date, noShowMinutes: number): boolean {
  return now.getTime() >= startsAt.getTime() + noShowMinutes * 60_000;
}
