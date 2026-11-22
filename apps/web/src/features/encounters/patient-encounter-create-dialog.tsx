import { EncounterCreateWizard } from "@/features/encounters/encounter-create-wizard";

export type PatientEncounterCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientLabel: string;
  defaultClinicId?: string;
  profileComplete?: boolean;
};

/** Patient-profile entry point — same wizard as the encounters list, with patient locked. */
export function PatientEncounterCreateDialog({
  open,
  onOpenChange,
  patientId,
  patientLabel,
  defaultClinicId = "",
  profileComplete = true,
}: PatientEncounterCreateDialogProps) {
  return (
    <EncounterCreateWizard
      open={open}
      onOpenChange={onOpenChange}
      lockedPatientId={patientId}
      lockedPatientLabel={patientLabel}
      defaultClinicId={defaultClinicId}
      profileComplete={profileComplete}
    />
  );
}
