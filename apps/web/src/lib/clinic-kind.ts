export type ClinicKind = "parent" | "branch" | "standalone";

export type ClinicPlacement = "standalone" | "branch";

export function clinicKindLabel(
  kind: ClinicKind,
  t: (key: string, defaultValue: string) => string,
): string {
  if (kind === "branch") return t("clinics.branch", "Branch");
  if (kind === "parent") return t("clinics.parent", "Parent");
  return t("clinics.standalone", "Clinic");
}

export function isRootClinic(clinic: { parentClinicId?: string | null }): boolean {
  return !clinic.parentClinicId;
}
