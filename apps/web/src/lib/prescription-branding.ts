import type { ClinicDetailDto } from "@/lib/api-types";
import { clinicPrescriptionLogoUrl } from "@/lib/prescription-hooks";
import { apiFetchBlob, apiGet } from "@/lib/http";
import { loadPrescriptionImage, type PrescriptionImageInput } from "@/lib/prescription-image";

export function resolvePrescriptionHeaderDescription(
  detail: Pick<ClinicDetailDto, "prescriptionHeaderDescriptionEn" | "prescriptionHeaderDescriptionAr">,
  locale: "en" | "ar",
): string | null {
  const en = detail.prescriptionHeaderDescriptionEn?.trim() ?? "";
  const ar = detail.prescriptionHeaderDescriptionAr?.trim() ?? "";
  const picked = locale === "ar" ? ar || en : en || ar;
  return picked || null;
}

export async function loadPrescriptionBranding(
  clinicId: string,
  locale: "en" | "ar",
): Promise<NonNullable<PrescriptionImageInput["branding"]>> {
  const detail = await apiGet<ClinicDetailDto>(`/api/v1/clinics/${clinicId}`);
  const headerDescription = resolvePrescriptionHeaderDescription(detail, locale);
  let logo: HTMLImageElement | null = null;

  if (detail.hasPrescriptionLogo) {
    const { blob } = await apiFetchBlob(clinicPrescriptionLogoUrl(clinicId));
    const url = URL.createObjectURL(blob);
    try {
      logo = await loadPrescriptionImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (!logo && !headerDescription) {
    return {};
  }

  return { logo, headerDescription };
}
