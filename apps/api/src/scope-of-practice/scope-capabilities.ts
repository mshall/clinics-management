/**
 * PRSOP02 — canonical registry of scope-of-practice capabilities (KX-05 Rev 2.3 §06, ADR-029).
 *
 * Every capability that a market pack's matrix or an `@RequiresScope(...)` decorator names MUST be listed here.
 * `scope-of-practice.node.test.ts` fails CI on an unknown capability (in the registry, in any shipped pack, or in
 * source). Scope of practice is a SAFETY control (ADR-025): nothing in this folder may use feature-flag gating.
 */
export const SCOPE_CAPABILITIES = [
  /** Appointments, patients, packages, payments. */
  "practice.core",
  "encounter.template.soap",
  "encounter.template.dental_chart",
  "encounter.template.physio",
  "encounter.template.nursing",
  /** Drug prescription (CL01..03): create/remove Rx lines, Rx safety check, print/send/hand off an Rx. */
  "rx.prescribe",
  /** Lab / radiology orders (CL06). */
  "orders.lab_radiology",
  "vitals.record",
  "outcome_measures.record",
  /** Record a session / visit note (supervised assistants may). */
  "sessions.record",
  /** Medication administration record (KX-23), against a doctor's order. */
  "mar.administer",
  "assistant.supervise",
  "home_visits.perform",
  /** Sign / finalize / amend an encounter. Assistants can never sign (PRSOP03). */
  "encounter.sign",
] as const;

export type ScopeCapability = (typeof SCOPE_CAPABILITIES)[number];

export function isScopeCapability(v: unknown): v is ScopeCapability {
  return typeof v === "string" && (SCOPE_CAPABILITIES as readonly string[]).includes(v);
}
