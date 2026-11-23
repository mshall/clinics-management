/**
 * Post-commit hook registry. AppointmentsService (module `appointments`) must not import the telehealth module (cycle), so it calls
 * `notifyTelehealthChanged` after its transaction; TelehealthService registers the handler at startup. No handler = no-op.
 */
type Handler = (tenantId: string, appointmentId: string) => Promise<void>;
let handler: Handler | null = null;
export function registerTelehealthChangedHandler(h: Handler | null): void {
  handler = h;
}
export async function notifyTelehealthChanged(tenantId: string, appointmentId: string): Promise<void> {
  try {
    await handler?.(tenantId, appointmentId);
  } catch {
    /* best-effort: the scheduler tick re-detects the change */
  }
}
