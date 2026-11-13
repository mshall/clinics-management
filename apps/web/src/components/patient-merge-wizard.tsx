import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/http";

export function PatientMergeWizard({ targetPatientId }: { targetPatientId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sourceId, setSourceId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const merge = useMutation({
    mutationFn: () => apiPost(`/api/v1/patients/${targetPatientId}/merge`, { sourcePatientId: sourceId.trim() }),
    onSuccess: () => {
      toast.success(t("patients.mergeDone", "Duplicate merged into this chart."));
      navigate(`/patients/${targetPatientId}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("patients.mergeWizard", "Merge duplicate patient")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("patients.mergeHint", "Moves visits, appointments, and documents from the duplicate into this chart, then retires the duplicate record.")}</p>
        <div className="space-y-1">
          <Label>{t("patients.mergeSourceId", "Duplicate patient ID")}</Label>
          <Input value={sourceId} onChange={(e) => setSourceId(e.target.value)} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          {t("patients.mergeConfirm", "I understand this cannot be undone easily")}
        </label>
        <Button type="button" variant="destructive" size="sm" disabled={!confirm || !sourceId.trim() || merge.isPending} onClick={() => merge.mutate()}>
          {t("patients.mergeRun", "Merge into this patient")}
        </Button>
      </CardContent>
    </Card>
  );
}
