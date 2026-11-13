import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";

type Problem = {
  id: string;
  labelEn: string;
  labelAr?: string | null;
  icd10Code?: string | null;
  status: string;
};

export function PatientActiveProblemsSection({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [labelEn, setLabelEn] = useState("");
  const [icd, setIcd] = useState("");
  const q = useQuery({
    queryKey: ["patient", patientId, "active-problems"],
    queryFn: () => apiGet<Problem[]>(`/api/v1/patients/${patientId}/active-problems`),
  });
  const save = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/patients/${patientId}/active-problems`, {
        labelEn: labelEn.trim(),
        icd10Code: icd.trim() || undefined,
        status: "ACTIVE",
      }),
    onSuccess: () => {
      setLabelEn("");
      setIcd("");
      void qc.invalidateQueries({ queryKey: ["patient", patientId, "active-problems"] });
      void qc.invalidateQueries({ queryKey: ["patient", patientId, "summary"] });
    },
  });

  const isAr = i18n.language.startsWith("ar");
  const active = (q.data ?? []).filter((p) => p.status === "ACTIVE");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("patients.activeProblems", "Active problems")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-1">
          {active.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>
                {isAr && p.labelAr ? p.labelAr : p.labelEn}
                {p.icd10Code ? <span className="text-muted-foreground"> ({p.icd10Code})</span> : null}
              </span>
            </li>
          ))}
          {active.length === 0 ? <li className="text-muted-foreground">{t("patients.noActiveProblems", "None documented")}</li> : null}
        </ul>
        {canEdit ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label required>{t("patients.problemLabel", "Problem")}</Label>
              <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label optional>ICD-10</Label>
              <Input value={icd} onChange={(e) => setIcd(e.target.value)} />
            </div>
            <Button type="button" size="sm" disabled={!labelEn.trim() || save.isPending} onClick={() => save.mutate()}>
              {t("common.add", "Add")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
