/**
 * Structured log events for safety alerts — the contract the infra alarms (infra/tofu/modules/aws/safety-alerts) read:
 *   {"event":"safety_alert.raised","alertId":"..."}
 *   {"event":"safety_alert.delivered","alertId":"...","channel":"...","deliveryLatencyMs":1234}
 *   {"event":"safety_alert.delivery_failed","alertId":"...","channel":"..."}
 * One JSON object per line on stdout. PHI-free by construction: ids, channel names and numbers only (never an address,
 * coordinates, name, phone or message body). The whitelist below is the only thing that can be written.
 */
export type SafetyLogEvent =
  | { event: "safety_alert.raised"; alertId: string; kind?: string }
  | { event: "safety_alert.delivered"; alertId: string; channel: string; deliveryLatencyMs: number }
  | { event: "safety_alert.delivery_failed"; alertId: string; channel: string }
  | { event: "safety_alert.escalated"; alertId: string };

export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => process.stdout.write(`${line}\n`);

export function emitSafetyLog(e: SafetyLogEvent, sink: LogSink = defaultSink): string {
  const clean: Record<string, string | number> = { event: e.event, alertId: e.alertId };
  if ("kind" in e && e.kind) clean.kind = e.kind;
  if ("channel" in e) clean.channel = String(e.channel).replace(/[^A-Za-z_]/g, "").slice(0, 24) || "UNKNOWN";
  if ("deliveryLatencyMs" in e) clean.deliveryLatencyMs = Math.max(0, Math.round(e.deliveryLatencyMs));
  const line = JSON.stringify(clean);
  sink(line);
  return line;
}
