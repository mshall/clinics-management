import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { CLINICAL_SPECIALTY_VALUES } from "@/lib/clinical-specialties";
import { apiGet, apiPut } from "@/lib/http";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type Editor = {
  listingId: string;
  completenessPercent: number;
  profile: Record<string, unknown>;
  preview: {
    provider: Record<string, unknown>;
    clinic: Record<string, unknown>;
  };
};

export function MarketplaceListingProfilePage() {
  const { clinicId, listingId } = useParams<{ clinicId: string; listingId: string }>();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["marketplace", "profile", listingId],
    queryFn: () => apiGet<Editor>(`/api/v1/marketplace-listings/${listingId}/profile`),
    enabled: Boolean(listingId),
  });

  const [displayNameEn, setDisplayNameEn] = useState("");
  const [displayNameAr, setDisplayNameAr] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [bioEn, setBioEn] = useState("");
  const [bioAr, setBioAr] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [languages, setLanguages] = useState("ar, en");

  useSyncOnChange([q.data], () => {
    const p = q.data?.profile;
    if (!p) return;
    setDisplayNameEn(String(p.displayNameEn ?? ""));
    setDisplayNameAr(String(p.displayNameAr ?? ""));
    setSpecialty(String(p.specialty ?? ""));
    setBioEn(String(p.bioEn ?? ""));
    setBioAr(String(p.bioAr ?? ""));
    setYearsExperience(p.yearsExperience != null ? String(p.yearsExperience) : "");
    setLanguages(Array.isArray(p.languages) ? (p.languages as string[]).join(", ") : "ar, en");
  });

  const saveMut = useMutation({
    mutationFn: () =>
      apiPut(`/api/v1/marketplace-listings/${listingId}/profile`, {
        profile: {
          displayNameEn,
          displayNameAr,
          specialty: specialty || undefined,
          bioEn,
          bioAr,
          yearsExperience: yearsExperience.trim() ? Number(yearsExperience) : undefined,
          languages: languages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          amenities: ["parking"],
          parking: true,
        },
      }),
    onSuccess: async () => {
      toast.success(t("kiorex.profile.saved", "Profile saved"));
      await qc.invalidateQueries({ queryKey: ["marketplace"] });
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeness = q.data?.completenessPercent ?? 0;
  const preview = q.data?.preview;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t("kiorex.profile.title", "Kiorex provider profile")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("kiorex.profile.subtitle", "Completeness must be at least 80% to go LIVE on Kiorex.")}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/clinics/${clinicId}`}>{t("common.back", "Back")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("kiorex.profile.completeness", "Completeness")}: <span className="ltr-nums">{completeness}%</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${completeness >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min(100, completeness)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("kiorex.profile.editor", "Editor")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <VerificationTextField label={t("kiorex.profile.displayNameEn", "Display name (EN)")} value={displayNameEn} onChange={setDisplayNameEn} />
            <VerificationTextField label={t("kiorex.profile.displayNameAr", "Display name (AR)")} value={displayNameAr} onChange={setDisplayNameAr} />
            <div className="space-y-1.5">
              <Label>{t("kiorex.profile.specialty", "Specialty")}</Label>
              <select className={nativeSelectClassName} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                <option value="">{t("common.select", "Select…")}</option>
                {CLINICAL_SPECIALTY_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {t(`clinicalSpecialty.${s}`, s)}
                  </option>
                ))}
              </select>
            </div>
            <Label>{t("kiorex.profile.bioEn", "Bio (EN)")}</Label>
            <Textarea value={bioEn} onChange={(e) => setBioEn(e.target.value)} rows={4} />
            <Label>{t("kiorex.profile.bioAr", "Bio (AR)")}</Label>
            <Textarea value={bioAr} onChange={(e) => setBioAr(e.target.value)} rows={4} dir="rtl" />
            <VerificationTextField label={t("kiorex.profile.yearsExperience", "Years of experience")} value={yearsExperience} onChange={setYearsExperience} />
            <VerificationTextField label={t("kiorex.profile.languages", "Languages (comma-separated)")} value={languages} onChange={setLanguages} />
            <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {t("common.save", "Save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("kiorex.profile.preview", "Live preview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-lg font-semibold">
              {i18n.language.startsWith("ar") ? displayNameAr || displayNameEn : displayNameEn || displayNameAr}
            </p>
            {specialty ? <p className="text-muted-foreground">{t(`clinicalSpecialty.${specialty}`, specialty)}</p> : null}
            <p className="whitespace-pre-wrap">{i18n.language.startsWith("ar") ? bioAr : bioEn}</p>
            {preview?.clinic ? (
              <p className="text-xs text-muted-foreground">
                {(preview.clinic as { addressEn?: string }).addressEn ?? ""} · {(preview.clinic as { phone?: string }).phone ?? ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VerificationTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}