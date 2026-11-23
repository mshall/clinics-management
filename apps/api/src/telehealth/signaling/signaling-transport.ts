import type { TelehealthRole, TelehealthSignalType } from "@prisma/client";

export type SignalMessage = { seq: number; fromRole: TelehealthRole; type: TelehealthSignalType; payload: unknown; createdAt: string };

/**
 * ADR-039 signaling seam. The shipped transport is HTTP polling (1 to 1.5 s) over the database; a WebSocket / SSE transport can be
 * added later behind the same interface without touching the call page's peer logic. Signals carry SDP/ICE only (no PHI).
 */
export interface SignalingTransport {
  publish(sessionId: string, from: TelehealthRole, type: TelehealthSignalType, payload: unknown): Promise<{ seq: number }>;
  /** Messages sent by the OTHER role with seq > afterSeq, oldest first. */
  fetch(sessionId: string, forRole: TelehealthRole, afterSeq: number, limit?: number): Promise<SignalMessage[]>;
  purgeOlderThan(cutoff: Date): Promise<number>;
}
export const SIGNALING_TRANSPORT = Symbol("SIGNALING_TRANSPORT");
