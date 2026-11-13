import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/http";

const SPECIALTIES = [
  "DENTISTRY",
  "OBSTETRICS_GYNECOLOGY",
  "PEDIATRICS",
  "PHYSIO_THERAPY",
  "DERMATOLOGY",
  "GENERAL_MEDICINE",
] as const;

type Template = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  isPublished: boolean;
  sectionsJson: unknown;
};

export function ClinicalTemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState<string>("GENERAL_MEDICINE");
  const [sectionsJson, setSectionsJson] = useState(
    JSON.stringify(
      [
        {
          id: "exam",
          titleEn: "Examination",
          titleAr: "الفحص",
          fields: [{ id: "notes", type: "textarea", labelEn: "Findings", labelAr: "النتائج" }],
        },
      ],
      null,
      2,
    ),
  );

  const listQuery = useQuery({
    queryKey: ["clinical", "templates"],
    queryFn: () => apiGet<Template[]>("/api/v1/clinical/form-templates"),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      apiPost<Template>("/api/v1/clinical/form-templates", {
        name,
        specialty,
        isPublished: true,
        sectionsJson: JSON.parse(sectionsJson) as unknown,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinical", "templates"] });
      setName("");
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">{t("clinical.templateBuilder", "Clinical template builder")}</h1>
      <p className="text-sm text-muted-foreground">
        {t(
          "clinical.templateBuilderHint",
          "Define JSON sections per specialty. Encounters attach a template and store answers alongside SOAP.",
        )}
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("clinical.newTemplate", "New template")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label required>{t("common.name", "Name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("clinical.specialty", "Specialty")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("clinical.sectionsJson", "Sections JSON")}</Label>
            <Textarea className="font-mono text-xs" rows={12} value={sectionsJson} onChange={(e) => setSectionsJson(e.target.value)} />
          </div>
          <Button type="button" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {t("common.save", "Save")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("clinical.publishedTemplates", "Published templates")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(listQuery.data ?? []).map((tpl) => (
            <div key={tpl.id} className="rounded-md border border-border px-3 py-2">
              <span className="font-medium">{tpl.name}</span> — {tpl.specialty.replace(/_/g, " ")}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
