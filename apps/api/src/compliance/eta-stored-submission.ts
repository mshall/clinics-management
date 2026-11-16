import { computeEtaReceiptUuid } from "./eta-egypt-serialize";
import type { EtaWireReceiptDocument } from "./eta-egypt-wire";

/** Exact wire document persisted at prepare time and resent unchanged on retry. */
export type EtaStoredSubmissionPayload = {
  schemaVersion: "eta-wire-v1";
  wireDocument: EtaWireReceiptDocument;
  receiptUuid: string;
  receiptNumber: number;
};

export function isEtaStoredSubmissionPayload(raw: unknown): raw is EtaStoredSubmissionPayload {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return o.schemaVersion === "eta-wire-v1" && o.wireDocument !== null && typeof o.wireDocument === "object";
}

export function assertWireUuidMatchesContentHash(wire: EtaWireReceiptDocument): void {
  const expected = wire.header.uuid?.trim();
  if (!expected) throw new Error("wire header.uuid missing");
  const forHash = {
    ...wire,
    header: { ...wire.header, uuid: "" },
  };
  const computed = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  if (computed !== expected) {
    throw new Error(`Wire UUID does not match content hash (expected ${expected}, got ${computed})`);
  }
}