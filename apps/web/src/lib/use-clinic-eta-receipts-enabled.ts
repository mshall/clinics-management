import { useClinicQuery } from "@/lib/api-hooks";

/** False when the clinic disabled ETA e-receipt queuing in settings. */
export function useClinicEtaReceiptsEnabled(clinicId: string | undefined): boolean {
  const detail = useClinicQuery(clinicId);
  if (!clinicId) return true;
  if (detail.isLoading) return true;
  return detail.data?.etaReceiptsEnabled !== false;
}