import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { CLINICAL_SPECIALTY_VALUES } from "@/lib/clinical-specialties";
import { apiGet, apiPost, apiPostFormData } from "@/lib/http";
import { ClinicianVerificationStatusChip } from "./clinician-verification-status-chip";

type VerificationDto = {
  status: string;
  syndicateNumber: string | null;
  specialty: string | null;
  titleEn: string | null;
  titleAr: string | null;
  rejectReason: string | null;
  documents: { kind: string; originalFileName: string }[];
};

const DOC_KINDS = ["SYNDICATE_CARD", "SPECIALTY_CERTIFICATE", "CLINIC_LICENCE", "PROFILE_PHOTO"] as const;

export function ClinicianVerificationPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["clinician-verification", "me"],
    queryFn: () => apiGet<VerificationDto>("/api/v1/clinicians/me/verification"),
  });
  const [syndicateNumber, setSyndicateNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [nationalId, setNationalId] = useState("");

  const saveMut = useMutation({
    mutationFn: (submit: boolean) =>
      apiPost<VerificationDto>("/api/v1/clinicians/me/verification", {
        syndicateNumber,
        specialty: specialty || undefined,
        titleEn,
        titleAr,
        nationalId: nationalId || undefined,
        submit,
      }),
    onSuccess: async (data, submit) => {
      toast.success(submit ? t("verification.submitted", "Submitted for review") : t("common.saved", "Saved"));
      await qc.invalidateQueries({ queryKey: ["clinician-verification"] });
      q.refetch();
      void qc.setQueryData(["clinician-verification", "me"], data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: ({ kind, file }: { kind: string; file: File }) => {
      const fd = new FormData();
      fd.set("file", file);
      return apiPostFormData<VerificationDto>(`/api/v1/clinicians/me/verification/documents/${kind}`, fd);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clinician-verification"] });
      toast.success(t("verification.docUploaded", "Document uploaded"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const v = q.data;
  useEffect(() => {
    if (!v) return;
    setSyndicateNumber(v.syndicateNumber ?? "");
    setSpecialty(v.specialty ?? "");
    setTitleEn(v.titleEn ?? "");
    setTitleAr(v.titleAr ?? "");
  }, [v]);
  const readOnly = v?.status === "PENDING" || v?.status === "VERIFIED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("verification.title", "Doctor verification")}</h1>
        <ClinicianVerificationStatusChip />
      </div>
      <p className="text-sm text-muted-foreground">{t("verification.subtitle", "Required for Kiorex marketplace listing. Documents stay private.")}</p>
      {v?.status === "REJECTED" && v.rejectReason ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{v.rejectReason}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("verification.details", "Professional details")}</CardTitle>
          <CardDescription>{t("verification.detailsHint", "Syndicate number, specialty, and titles as shown to patients on Kiorex.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <VerificationTextField label={t("verification.syndicateNumber", "Syndicate number")} value={syndicateNumber} onChange={setSyndicateNumber} disabled={readOnly} />
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("verification.specialty", "Specialty")}</Label>
            <select className={nativeSelectClassName} disabled={readOnly} value={specialty || v?.specialty || ""} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">{t("common.select", "Select…")}</option>
              {CLINICAL_SPECIALTY_VALUES.map((s) => (
                <option key={s} value={s}>
                  {t(`clinicalSpecialty.${s}`, s)}
                </option>
              ))}
            </select>
          </div>
          <VerificationTextField label={t("verification.titleEn", "Title (EN)")} value={titleEn} onChange={setTitleEn} disabled={readOnly} />
          <VerificationTextField label={t("verification.titleAr", "Title (AR)")} value={titleAr} onChange={setTitleAr} disabled={readOnly} />
          <VerificationTextField label={t("verification.nationalId", "National ID")} value={nationalId} onChange={setNationalId} disabled={readOnly} className="sm:col-span-2 ltr-nums" placeholder="••••••••" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("verification.documents", "Documents")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DOC_KINDS.map((kind) => {
            const existing = v?.documents.find((d) => d.kind === kind);
            return (
              <div key={kind} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{t(`verification.docKind.${kind}`, kind)}</span>
                <VerificationTextField
                  asFile
                  disabled={readOnly}
                  label={existing?.originalFileName ?? t("verification.upload", "Upload")}
                  onFile={(file: File) => uploadMut.mutate({ kind, file })}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={readOnly || saveMut.isPending} onClick={() => saveMut.mutate(false)}>
          {t("verification.saveDraft", "Save draft")}
        </Button>
        <Button type="button" disabled={readOnly || saveMut.isPending} onClick={() => saveMut.mutate(true)}>
          {t("verification.submit", "Submit for review")}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link to="/clinics">{t("verification.kiorexTab", "Kiorex appointment types")}</Link>
        </Button>
      </div>
    </div>
  );
}

type VerificationTextFieldProps =
  | {
      label: string;
      value: string;
      onChange: (v: string) => void;
      disabled?: boolean;
      className?: string;
      placeholder?: string;
      asFile?: false;
    }
  | {
      label: string;
      disabled?: boolean;
      asFile: true;
      onFile?: (f: File) => void;
    };

function VerificationTextField(props: VerificationTextFieldProps) {
  if (props.asFile) {
    return (
      <label className="cursor-pointer text-primary underline">
        {props.label}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={props.disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f && props.onFile) props.onFile(f); }} />
      </label>
    );
  }
  return (
    <div className={`space-y-1.5 ${props.className ?? ""}`}>
      <Label>{props.label}</Label>
      <Input className={props.className} placeholder={props.placeholder} disabled={props.disabled} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}