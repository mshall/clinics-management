/**
 * Pure builder for the Nurse-edition `LabOrderPlaced` payload (`data` of the contract envelope, kiorex-contracts 1.6.0).
 * Validated against the vendored JSON Schema in `lab-sample.node.test.ts`. Carries tube labels, times and identifier KINDS; the only
 * demographics are the minimum the lab needs to accession (name, date of birth, sex, phone) and they travel only under the consent
 * token. Never a national id, address or clinical notes.
 */
export type LabOrderPlacedNurseInput = {
  orderId: string;
  encounterId?: string | null;
  clinicId: string;
  patientRef: string;
  orderingClinicianId: string;
  consentToken: string;
  orderedAt: Date;
  items: { code?: string | null; nameEn: string; nameAr?: string | null }[];
  prescriberName?: string | null;
  identifiersChecked: string[];
  patient: { fullName: string; dateOfBirth?: Date | null; sex?: "M" | "F" | "OTHER" | "UNKNOWN"; phone?: string | null };
  visitRef: string;
  collectorRef: string;
  collectorName?: string | null;
  collectedAt: Date;
  handedOverAt?: Date | null;
  temperatureC?: number | null;
  samples: { label: string; specimenType: string; container?: string }[];
};

export function labOrderPlacedNurseData(i: LabOrderPlacedNurseInput) {
  return {
    orderId: i.orderId,
    ...(i.encounterId ? { encounterId: i.encounterId } : {}),
    clinicId: i.clinicId,
    patientRef: i.patientRef,
    orderingClinicianId: i.orderingClinicianId,
    consentToken: i.consentToken,
    orderedAt: i.orderedAt.toISOString(),
    items: i.items.map((it) => ({ ...(it.code ? { code: it.code } : {}), nameEn: it.nameEn, ...(it.nameAr ? { nameAr: it.nameAr } : {}) })),
    originEdition: "NURSE" as const,
    ...(i.prescriberName ? { prescriberName: i.prescriberName } : {}),
    identifiersChecked: i.identifiersChecked,
    patient: {
      fullName: i.patient.fullName,
      ...(i.patient.dateOfBirth ? { dateOfBirth: i.patient.dateOfBirth.toISOString().slice(0, 10) } : {}),
      ...(i.patient.sex ? { sex: i.patient.sex } : {}),
      ...(i.patient.phone ? { phone: i.patient.phone } : {}),
    },
    nurseCollection: {
      visitRef: i.visitRef,
      collectorRef: i.collectorRef,
      ...(i.collectorName ? { collectorName: i.collectorName } : {}),
      collectedAt: i.collectedAt.toISOString(),
      ...(i.handedOverAt ? { handedOverAt: i.handedOverAt.toISOString() } : {}),
      ...(i.temperatureC != null ? { temperatureC: i.temperatureC } : {}),
      samples: i.samples.map((s) => ({ label: s.label, specimenType: s.specimenType, ...(s.container ? { container: s.container } : {}) })),
    },
  };
}
