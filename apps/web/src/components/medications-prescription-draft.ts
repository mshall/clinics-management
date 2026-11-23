export function emptyPendingMedication(): PendingMedication {
  return { id: crypto.randomUUID(), drugName: "", dosage: "", frequency: "" };
}

export function resetMedicationsPrescriptionDraft() {
  return {
    medTab: "none" as MedTab,
    medications: [] as PendingMedication[],
    prescriptionFiles: [] as File[],
    generatedPrescriptionFile: null as File | null,
  };
}

export type MedTab = "none" | "manual" | "prescription";

export type PendingMedication = {
  id: string;
  drugName: string;
  dosage: string;
  frequency: string;
};
