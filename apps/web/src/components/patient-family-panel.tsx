import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost } from "@/lib/http";

type LinkRow = {
  id: string;
  relation: string;
  fromPatient: { id: string; mrn: string; firstNameEn: string; lastNameEn: string };
  toPatient: { id: string; mrn: string; firstNameEn: string; lastNameEn: string };
};

export function PatientFamilyPanel({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [toPatientId, setToPatientId] = useState("");
  const [relation, setRelation] = useState("CHILD");
  const q = useQuery({
    queryKey: ["patient", patientId, "family"],
    queryFn: () => apiGet<LinkRow[]>(`/api/v1/patients/${patientId}/family-links`),
  });
  const add = useMutation({
    mutationFn: () => apiPost(`/api/v1/patients/${patientId}/family-links`, { toPatientId: toPatientId.trim(), relation }),
    onSuccess: () => {
      setToPatientId("");
      void qc.invalidateQueries({ queryKey: ["patient", patientId, "family"] });
    },
  });
  const remove = useMutation({
    mutationFn: (linkId: string) => apiDelete(`/api/v1/patients/${patientId}/family-links/${linkId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["patient", patientId, "family"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("patients.family", "Family links")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-2">
          {(q.data ?? []).map((row) => {
            const other = row.fromPatient.id === patientId ? row.toPatient : row.fromPatient;
            return (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <span>
                  <Link to={`/patients/${other.id}`} className="text-primary hover:underline">
                    {other.firstNameEn} {other.lastNameEn}
                  </Link>{" "}
                  <span className="text-muted-foreground">({row.relation})</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove.mutate(row.id)}>
                  {t("common.remove")}
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("patients.linkPatientId", "Linked patient ID")}</Label>
            <Input value={toPatientId} onChange={(e) => setToPatientId(e.target.value)} placeholder="cuid…" />
          </div>
          <div className="space-y-1">
            <Label>{t("patients.relation", "Relation")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              {["CHILD", "PARENT", "SPOUSE", "GUARDIAN", "OTHER"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" disabled={!toPatientId.trim() || add.isPending} onClick={() => add.mutate()}>
            {t("patients.addFamilyLink", "Link member")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
