import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiDelete, apiGet, apiPost } from "@/lib/http";
import { CLINICAL_SPECIALTY_OPTIONS, formatClinicalSpecialty } from "@/lib/clinical-specialties";

type Template = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  isPublished: boolean;
  isSystemDefault: boolean;
  clinicId: string | null;
  customSpecialtyLabelEn: string | null;
  customSpecialtyLabelAr: string | null;
};

const SAMPLE_SECTIONS = [
  {
    id: "history",
    titleEn: "History",
    titleAr: "التاريخ",
    fields: [{ id: "notes", type: "textarea", labelEn: "Clinical notes", labelAr: "ملاحظات سريرية" }],
  },
];

type Props = {
  clinicId: string;
  clinicSpecialty?: string;
  canEdit: boolean;
};

export function ClinicClinicalTemplatesPanel({ clinicId, clinicSpecialty, canEdit }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState<string>(clinicSpecialty ?? "GENERAL_MEDICINE");
  const [customEn, setCustomEn] = useState("");
  const [customAr, setCustomAr] = useState("");
  const [sectionsJson, setSectionsJson] = useState(JSON.stringify(SAMPLE_SECTIONS, null, 2));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["clinical", "templates", clinicId],
    queryFn: () => apiGet<Template[]>(`/api/v1/clinical/form-templates?clinicId=${clinicId}`),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(sectionsJson);
      } catch {
        throw new Error(t("clinical.sectionsJsonInvalid", "Sections JSON is invalid."));
      }
      return apiPost<Template>("/api/v1/clinical/form-templates", {
        clinicId,
        name,
        specialty,
        isPublished: true,
        sectionsJson: parsed,
        ...(specialty === "CUSTOM"
          ? { customSpecialtyLabelEn: customEn.trim(), customSpecialtyLabelAr: customAr.trim() || undefined }
          : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinical", "templates", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinical", "templates"] });
      setName("");
      toast.success(t("clinical.templateSaved", "Clinical template saved."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/clinical/form-templates/${id}`),
    onSuccess: () => {
      setDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["clinical", "templates", clinicId] });
      toast.success(t("clinical.templateDeleted", "Custom template removed."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = listQuery.data ?? [];
  const defaults = templates.filter((t) => t.isSystemDefault);
  const customs = templates.filter((t) => !t.isSystemDefault && t.clinicId === clinicId);

  const specialtyLabel = (tpl: Template) =>
    tpl.specialty === "CUSTOM"
      ? (i18n.language.startsWith("ar") ? tpl.customSpecialtyLabelAr : tpl.customSpecialtyLabelEn) ||
        tpl.customSpecialtyLabelEn ||
        t("clinical.specialtyCustom", "Custom")
      : formatClinicalSpecialty(tpl.specialty, t);

  return (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{t("clinical.clinicTemplatesTitle", "Clinical form templates")}</CardTitle>
      <CardDescription>
        {t(
          "clinical.clinicTemplatesHint",
          "Comprehensive EN/AR defaults exist for every specialty. Add extra custom templates for this clinic only. Encounters at this clinic can pick any default or custom form.",
        )}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium">{t("clinical.systemDefaults", "Organization defaults")}</h3>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {defaults.map((tpl) => (
            <li key={tpl.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="font-medium">{tpl.name}</span>
              <Badge variant="secondary">{specialtyLabel(tpl)}</Badge>
              <Badge variant="outline">{t("clinical.systemDefaultBadge", "Built-in")}</Badge>
            </li>
          ))}
          {!defaults.length && listQuery.isPending ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : null}
        </ul>
      </div>

      {customs.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">{t("clinical.clinicCustomTemplates", "This clinic — custom")}</h3>
          <ul className="space-y-2 text-sm">
            {customs.map((tpl) => (
              <li key={tpl.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span>
                  <span className="font-medium">{tpl.name}</span> — {specialtyLabel(tpl)}
                </span>
                {canEdit ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteId(tpl.id)}>
                    {t("common.delete", "Delete")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{t("clinical.addCustomTemplate", "Add custom template")}</h3>
          <div className="space-y-2">
            <Label required>{t("common.name", "Name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("clinical.templateNamePlaceholder", "e.g. IVF intake extension")} />
          </div>
          <div className="space-y-2">
            <Label>{t("clinical.specialty", "Specialty")}</Label>
            <select
              className={nativeSelectClassName}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              {CLINICAL_SPECIALTY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {formatClinicalSpecialty(s, t)}
                </option>
              ))}
            </select>
          </div>
          {specialty === "CUSTOM" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label required>{t("clinical.customSpecialtyEn", "Custom specialty (English)")}</Label>
                <Input value={customEn} onChange={(e) => setCustomEn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("clinical.customSpecialtyAr", "Custom specialty (Arabic)")}</Label>
                <Input value={customAr} onChange={(e) => setCustomAr(e.target.value)} dir="rtl" />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{t("clinical.sectionsJson", "Sections JSON")}</Label>
            <Textarea className="font-mono text-xs" rows={10} value={sectionsJson} onChange={(e) => setSectionsJson(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("clinical.sectionsJsonHint", "Each section needs titleEn/titleAr and fields with labelEn/labelAr.")}</p>
          </div>
          <Button
            type="button"
            disabled={
              !name.trim() ||
              saveMut.isPending ||
              (specialty === "CUSTOM" && customEn.trim().length < 2)
            }
            onClick={() => saveMut.mutate()}
          >
            {t("clinical.publishCustom", "Publish for this clinic")}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t("clinical.deleteTemplateTitle", "Remove custom template?")}
        description={t("clinical.deleteTemplateIntro", "Encounters already using this template are unaffected until you change them.")}
        confirmLabel={t("common.delete", "Delete")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
      />
    </CardContent>
  </Card>
  );
}