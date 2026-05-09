/** Resolve a table cell label for a patient row; prefer API MRN/name over a local registry slice. */
export function resolvePatientListLabel(input: {
  patientId: string;
  patientMrn?: string | null;
  patientName?: string | null;
  /** From a cached patients query (e.g. first page only); used only when API omits name fields */
  registryLabel?: string | null;
}): { text: string; isIdFallback: boolean } {
  const mr = input.patientMrn?.trim();
  const nm = input.patientName?.trim();
  if (mr && nm) return { text: `${mr} — ${nm}`, isIdFallback: false };
  if (nm) return { text: nm, isIdFallback: false };
  if (mr) return { text: mr, isIdFallback: false };
  const reg = input.registryLabel?.trim();
  if (reg) return { text: reg, isIdFallback: false };
  return { text: `${input.patientId.slice(0, 8)}…`, isIdFallback: true };
}
