import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";
import { MIDDLE_EAST_COUNTRY_OPTIONS } from "@/lib/middle-east-countries";

type AddClinicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddClinicDialog({ open, onOpenChange }: AddClinicDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();

  const [clParentId, setClParentId] = useState("");
  const [clNameEn, setClNameEn] = useState("");
  const [clNameAr, setClNameAr] = useState("");
  const [clCity, setClCity] = useState("");
  const [clCountry, setClCountry] = useState("AE");
  const [clAddressEn, setClAddressEn] = useState("");
  const [clAddressAr, setClAddressAr] = useState("");
  const [clLocationUrl, setClLocationUrl] = useState("");
  const [clLogoUrl, setClLogoUrl] = useState("");
  const [clPhone, setClPhone] = useState("");
  const [clEmail, setClEmail] = useState("");
  const [clLicense, setClLicense] = useState("");
  const [clinicErr, setClinicErr] = useState<string | null>(null);

  const parentClinicPickItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("admin.newParentClinic", "None — create as parent clinic") },
      ...clinics.filter((c) => c.kind === "parent").map((c) => ({ value: c.id, label: c.nameEn })),
    ],
    [clinics, t]
  );

  const countryPickItems: PickListItem[] = useMemo(
    () => MIDDLE_EAST_COUNTRY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.value})` })),
    []
  );

  const resetClinicForm = () => {
    setClParentId("");
    setClNameEn("");
    setClNameAr("");
    setClCity("");
    setClCountry("AE");
    setClAddressEn("");
    setClAddressAr("");
    setClLocationUrl("");
    setClLogoUrl("");
    setClPhone("");
    setClEmail("");
    setClLicense("");
  };

  const createClinicMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/clinics", {
        parentClinicId: clParentId || undefined,
        nameEn: clNameEn.trim(),
        nameAr: clNameAr.trim(),
        city: clCity.trim(),
        country: clCountry.trim() || "AE",
        addressEn: clAddressEn.trim(),
        addressAr: clAddressAr.trim(),
        locationUrl: clLocationUrl.trim(),
        logoUrl: clLogoUrl.trim() || undefined,
        phone: clPhone.trim() || undefined,
        email: clEmail.trim() || undefined,
        licenseNumber: clLicense.trim() || undefined,
      }),
    onSuccess: () => {
      setClinicErr(null);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      resetClinicForm();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setClinicErr(String((e.body as { message?: unknown }).message));
      } else setClinicErr(e instanceof Error ? e.message : String(e));
    },
  });

  const canSave =
    clNameEn.trim() &&
    clNameAr.trim() &&
    clCity.trim() &&
    clAddressEn.trim() &&
    clAddressAr.trim() &&
    clLocationUrl.trim() &&
    !createClinicMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setClinicErr(null);
          resetClinicForm();
        }
      }}
    >
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-[36rem]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("admin.addClinicDialogTitle", "Add clinic")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.parentClinic", "Parent clinic (optional)")}</Label>
            <SearchablePickList
              items={parentClinicPickItems}
              value={clParentId}
              onValueChange={setClParentId}
              searchPlaceholder={t("admin.filterParentClinic", "Type to find parent…")}
              placeholder={t("admin.pickParent", "Parent")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.nameEn", "Name (EN)")}</Label>
            <Input value={clNameEn} onChange={(e) => setClNameEn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.nameAr", "Name (AR)")}</Label>
            <Input value={clNameAr} onChange={(e) => setClNameAr(e.target.value)} dir="rtl" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.city", "City")}</Label>
            <Input value={clCity} onChange={(e) => setClCity(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.country", "Country")}</Label>
            <SearchablePickList
              items={countryPickItems}
              value={clCountry}
              onValueChange={setClCountry}
              searchPlaceholder={t("admin.filterCountry", "Type country name or code…")}
              placeholder={t("admin.country")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.addressEn", "Full address (English)")}</Label>
            <textarea
              className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={clAddressEn}
              onChange={(e) => setClAddressEn(e.target.value)}
              placeholder={t("admin.addressEnPh", "Street, building, area…")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.addressAr", "Full address (Arabic)")}</Label>
            <textarea
              className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={clAddressAr}
              onChange={(e) => setClAddressAr(e.target.value)}
              dir="rtl"
              placeholder={t("admin.addressArPh", "العنوان الكامل…")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.locationUrl", "Location link (maps URL)")}</Label>
            <Input
              className="ltr-nums"
              type="url"
              value={clLocationUrl}
              onChange={(e) => setClLocationUrl(e.target.value)}
              placeholder="https://maps.google.com/?q=..."
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.logoUrl", "Logo (image URL)")}</Label>
            <Input
              className="ltr-nums"
              type="url"
              value={clLogoUrl}
              onChange={(e) => setClLogoUrl(e.target.value)}
              placeholder="https://…"
            />
            {clLogoUrl.trim() ? (
              <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
                <p className="mb-1 text-xs text-muted-foreground">{t("admin.logoPreview", "Preview")}</p>
                <img
                  src={clLogoUrl.trim()}
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
            <Label>{t("admin.phone", "Phone")}</Label>
            <Input className="ltr-nums" value={clPhone} onChange={(e) => setClPhone(e.target.value)} placeholder="+971…" />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.email", "Email")}</Label>
            <Input type="email" value={clEmail} onChange={(e) => setClEmail(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("admin.licenseNumber", "License number")}</Label>
            <Input className="font-mono text-sm" value={clLicense} onChange={(e) => setClLicense(e.target.value)} />
          </div>
          {clinicErr ? <p className="text-sm text-destructive sm:col-span-full">{clinicErr}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => createClinicMut.mutate()}>
            {t("admin.saveClinic", "Save clinic")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
