export type ClinicFormValues = {
  clinicPlacement: "standalone" | "branch";
  parentClinicId: string;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  logoUrl: string;
  phone: string;
  email: string;
  licenseNumber: string;
};

export function emptyClinicForm(): ClinicFormValues {
  return {
    clinicPlacement: "standalone",
    parentClinicId: "",
    nameEn: "",
    nameAr: "",
    city: "",
    country: "AE",
    addressEn: "",
    addressAr: "",
    locationUrl: "",
    logoUrl: "",
    phone: "",
    email: "",
    licenseNumber: "",
  };
}

/** Matches API requirements: English name, Arabic name, and city. Other fields get server defaults when omitted. */
export function isClinicFormComplete(v: ClinicFormValues): boolean {
  return Boolean(v.nameEn.trim() && v.nameAr.trim() && v.city.trim());
}

type ClinicFormTranslate = (key: string, defaultValue: string) => string;

export function collectClinicFormErrors(
  v: ClinicFormValues,
  t: ClinicFormTranslate,
  opts?: { tenantId?: string; requireTenant?: boolean },
): string[] {
  const errors: string[] = [];
  if (opts?.requireTenant && !opts.tenantId?.trim()) {
    errors.push(t("platform.errorOrgNotSelected", "No organization selected."));
  }
  if (!v.nameEn.trim()) {
    errors.push(t("admin.errorClinicNameEn", "Clinic name (English) is required."));
  }
  if (!v.nameAr.trim()) {
    errors.push(t("admin.errorClinicNameAr", "Clinic name (Arabic) is required."));
  }
  if (!v.city.trim()) {
    errors.push(t("admin.errorClinicCity", "City is required."));
  }
  if (v.clinicPlacement === "branch" && !v.parentClinicId.trim()) {
    errors.push(t("admin.errorClinicParent", "Select the parent clinic for this branch."));
  }
  return errors;
}

/** True when the user started filling clinic fields but has not completed required ones. */
export function hasPartialClinicForm(v: ClinicFormValues): boolean {
  if (isClinicFormComplete(v)) return false;
  return Boolean(
    v.nameEn.trim() ||
      v.nameAr.trim() ||
      v.city.trim() ||
      v.addressEn.trim() ||
      v.addressAr.trim() ||
      v.locationUrl.trim() ||
      v.phone.trim() ||
      v.email.trim() ||
      v.licenseNumber.trim() ||
      v.logoUrl.trim() ||
      v.parentClinicId.trim() ||
      v.clinicPlacement === "branch",
  );
}

export function clinicFormToCreatePayload(v: ClinicFormValues, opts?: { includeParent?: boolean }) {
  const body: Record<string, string | undefined> = {
    nameEn: v.nameEn.trim(),
    nameAr: v.nameAr.trim(),
    city: v.city.trim(),
    country: v.country.trim() || "AE",
    addressEn: v.addressEn.trim(),
    addressAr: v.addressAr.trim(),
    locationUrl: v.locationUrl.trim(),
    logoUrl: v.logoUrl.trim() || undefined,
    phone: v.phone.trim() || undefined,
    email: v.email.trim() || undefined,
    licenseNumber: v.licenseNumber.trim() || undefined,
  };
  if (v.clinicPlacement === "branch" && opts?.includeParent !== false && v.parentClinicId.trim()) {
    body.parentClinicId = v.parentClinicId.trim();
  }
  return body;
}

export function clinicDetailToForm(d: {
  parentClinicId?: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  logoUrl?: string | null;
  phone?: string;
  email?: string;
  licenseNumber: string;
}): ClinicFormValues {
  return {
    clinicPlacement: d.parentClinicId ? "branch" : "standalone",
    parentClinicId: d.parentClinicId ?? "",
    nameEn: d.nameEn,
    nameAr: d.nameAr,
    city: d.city,
    country: d.country,
    addressEn: d.addressEn,
    addressAr: d.addressAr,
    locationUrl: d.locationUrl,
    logoUrl: d.logoUrl ?? "",
    phone: d.phone ?? "",
    email: d.email ?? "",
    licenseNumber: d.licenseNumber,
  };
}
