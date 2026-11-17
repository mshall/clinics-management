import type { EtaFailureClass } from "./eta-submit-classify";

export type EtaRejectionRunbookKey =
  | "credentials"
  | "validation"
  | "duplicate"
  | "temporary"
  | "buyer_name"
  | "item_code"
  | "branch_trn"
  | "unknown";

export const ETA_REJECTION_RUNBOOK_KEYS: EtaRejectionRunbookKey[] = [
  "credentials",
  "validation",
  "duplicate",
  "temporary",
  "buyer_name",
  "item_code",
  "branch_trn",
  "unknown",
];

export function classifyRejectionRunbookKey(opts: {
  failureClass?: EtaFailureClass | null;
  errorMessage?: string | null;
  providerValidationStatus?: string | null;
}): EtaRejectionRunbookKey {
  const msg = (opts.errorMessage ?? "").toLowerCase();
  if (opts.failureClass === "credentials") return "credentials";
  if (opts.failureClass === "duplicate") return "duplicate";
  if (opts.failureClass === "temporary" || opts.failureClass === "unclear") return "temporary";
  if (/buyer|receiver.*name|150,?000/i.test(msg)) return "buyer_name";
  if (/itemcode|item code|gpc/i.test(msg)) return "item_code";
  if (/rin|trn|branch|activity code/i.test(msg)) return "branch_trn";
  if (opts.providerValidationStatus === "INVALID" || opts.failureClass === "permanent") return "validation";
  return "unknown";
}