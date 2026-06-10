import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIDDLE_EAST_COUNTRY_OPTIONS } from "@/lib/middle-east-countries";
import type { ClinicFormValues } from "./clinic-form-utils";

type ClinicFormFieldsProps = {
  values: ClinicFormValues;
  onChange: (patch: Partial<ClinicFormValues>) => void;
  showParentPicker?: boolean;
  parentClinicItems?: PickListItem[];
  idPrefix?: string;
};

export function ClinicFormFields({
  values,
  onChange,
  showParentPicker = false,
  parentClinicItems = [],
  idPrefix = "clinic",
}: ClinicFormFieldsProps) {
  const { t } = useTranslation();

  const countryPickItems: PickListItem[] = useMemo(
    () => MIDDLE_EAST_COUNTRY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.value})` })),
    [],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showParentPicker ? (
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-2">
            <Label>{t("admin.clinicPlacement", "Clinic structure")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`${idPrefix}-placement`}
                  className="mt-1"
                  checked={values.clinicPlacement === "standalone"}
                  onChange={() => onChange({ clinicPlacement: "standalone", parentClinicId: "" })}
                />
                <span>
                  <span className="font-medium">{t("admin.clinicPlacementStandalone", "Standalone clinic")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("admin.clinicPlacementStandaloneHint", "Same level as other root clinics in the organization.")}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`${idPrefix}-placement`}
                  className="mt-1"
                  checked={values.clinicPlacement === "branch"}
                  onChange={() => onChange({ clinicPlacement: "branch" })}
                />
                <span>
                  <span className="font-medium">{t("admin.clinicPlacementBranch", "Branch of an existing clinic")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("admin.clinicPlacementBranchHint", "Attach under a root-level clinic as a child location.")}
                  </span>
                </span>
              </label>
            </div>
          </div>
          {values.clinicPlacement === "branch" ? (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-parent`} required>
                {t("admin.parentClinic", "Parent clinic")}
              </Label>
              <SearchablePickList
                items={parentClinicItems}
                value={values.parentClinicId}
                onValueChange={(v) => onChange({ parentClinicId: v })}
                searchPlaceholder={t("admin.filterParentClinic", "Type to find parent…")}
                placeholder={t("admin.pickParent", "Parent")}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-nameEn`} required>
          {t("admin.nameEn", "Name (EN)")}
        </Label>
        <Input id={`${idPrefix}-nameEn`} value={values.nameEn} onChange={(e) => onChange({ nameEn: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-nameAr`} required>
          {t("admin.nameAr", "Name (AR)")}
        </Label>
        <Input
          id={`${idPrefix}-nameAr`}
          value={values.nameAr}
          onChange={(e) => onChange({ nameAr: e.target.value })}
          dir="rtl"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-city`} required>
          {t("admin.city", "City")}
        </Label>
        <Input id={`${idPrefix}-city`} value={values.city} onChange={(e) => onChange({ city: e.target.value })} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>{t("admin.country", "Country")}</Label>
        <SearchablePickList
          items={countryPickItems}
          value={values.country}
          onValueChange={(v) => onChange({ country: v })}
          searchPlaceholder={t("admin.filterCountry", "Type country name or code…")}
          placeholder={t("admin.country")}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-addressEn`}>
          {t("admin.addressEn", "Full address (English)")}{" "}
          <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
        </Label>
        <textarea
          id={`${idPrefix}-addressEn`}
          className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={values.addressEn}
          onChange={(e) => onChange({ addressEn: e.target.value })}
          placeholder={t("admin.addressEnPh", "Street, building, area…")}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-addressAr`}>
          {t("admin.addressAr", "Full address (Arabic)")}{" "}
          <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
        </Label>
        <textarea
          id={`${idPrefix}-addressAr`}
          className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={values.addressAr}
          onChange={(e) => onChange({ addressAr: e.target.value })}
          dir="rtl"
          placeholder={t("admin.addressArPh", "العنوان الكامل…")}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-location`}>
          {t("admin.locationUrl", "Location link (maps URL)")}{" "}
          <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
        </Label>
        <Input
          id={`${idPrefix}-location`}
          className="ltr-nums"
          type="url"
          value={values.locationUrl}
          onChange={(e) => onChange({ locationUrl: e.target.value })}
          placeholder="https://maps.google.com/?q=..."
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-logo`}>{t("admin.logoUrl", "Logo (image URL)")}</Label>
        <Input
          id={`${idPrefix}-logo`}
          className="ltr-nums"
          type="url"
          value={values.logoUrl}
          onChange={(e) => onChange({ logoUrl: e.target.value })}
          placeholder="https://…"
        />
        {values.logoUrl.trim() ? (
          <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
            <p className="mb-1 text-xs text-muted-foreground">{t("admin.logoPreview", "Preview")}</p>
            <img
              src={values.logoUrl.trim()}
              alt=""
              className="max-h-20 max-w-[12rem] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>{t("admin.phone", "Phone")}</Label>
        <Input
          id={`${idPrefix}-phone`}
          className="ltr-nums"
          value={values.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="+971…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>{t("admin.email", "Email")}</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-license`}>{t("admin.licenseNumber", "License number")}</Label>
        <Input
          id={`${idPrefix}-license`}
          className="font-mono text-sm"
          value={values.licenseNumber}
          onChange={(e) => onChange({ licenseNumber: e.target.value })}
        />
      </div>
    </div>
  );
}
