import type { TFunction } from "i18next";
import {
  canCreateOrgUser,
  getOrgUserCreateMissingFields,
  ORG_USER_PASSWORD_MIN_LENGTH,
  type OrgUserCreateField,
  type OrgUserCreateFormInput,
} from "@/features/platform/platform-shared";

export { ORG_USER_PASSWORD_MIN_LENGTH };

export function orgUserCreateFormReady(
  values: OrgUserCreateFormInput,
  opts?: { requireTenant?: boolean },
): boolean {
  return canCreateOrgUser(values, opts);
}

export function orgUserCreateMissingLabels(
  missing: OrgUserCreateField[],
  t: TFunction,
): string[] {
  const labels: Record<OrgUserCreateField, string> = {
    tenant: t("admin.orgUserCreateMissingTenant", "organization"),
    email: t("admin.orgUserCreateMissingEmail", "email"),
    displayName: t("admin.orgUserCreateMissingDisplayName", "display name"),
    password: t("admin.orgUserCreateMissingPassword", "password"),
    passwordMinLength: t("admin.orgUserCreateMissingPasswordMin", "password (at least 8 characters)"),
    clinics: t("admin.orgUserCreateMissingClinics", "at least one assigned clinic"),
  };
  return missing.map((field) => labels[field]);
}

export function getOrgUserCreateMissingLabels(
  values: OrgUserCreateFormInput,
  t: TFunction,
  opts?: { requireTenant?: boolean },
): string[] {
  return orgUserCreateMissingLabels(getOrgUserCreateMissingFields(values, opts), t);
}
