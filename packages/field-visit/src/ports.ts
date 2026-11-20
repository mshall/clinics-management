/** Ports the host product implements (Kiorly Clinic, Nurse, Lab). The package itself performs no I/O. */

export interface Clock {
  nowMs(): number;
}

/** Travel time between two districts in minutes; null = unknown. Backed by a precomputed matrix, later a routing service. */
export interface TravelMatrix {
  minutes(fromDistrictId: string, toDistrictId: string): number | null;
}

export type SafetyChannel = "SMS" | "WHATSAPP" | "PUSH" | "VOICE";

export type DispatchReceipt = { deliveredAtMs: number; channel: SafetyChannel | string };

/**
 * Delivers a safety alert to the organisation's safety contact. Real implementations sit behind a MODE=mock|real adapter
 * in the host (CLAUDE.md: provider integrations are mocked until the go-live pass). Must throw / reject on failure so the
 * escalation can fall through to the next channel.
 */
export interface SafetyAlertDispatcher {
  readonly channel: SafetyChannel | string;
  dispatch(alert: import("./safety").SafetyAlert): Promise<DispatchReceipt>;
}
