import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPut } from "@/lib/http";
import type { KiorexCancellationPolicy, KiorexSettingsDto } from "./kiorex-types";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

const FIELDS: (keyof KiorexCancellationPolicy)[] = [
  "patientCancelMinHours",
  "patientRescheduleMinHours",
  "depositRefundMinHours",
  "maxPatientReschedules",
];

export function KiorexPolicyCard({ clinicId, settings }: { clinicId: string; settings: KiorexSettingsDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const effective = settings.cancellationPolicy.effective;
  const [draft, setDraft] = useState<Record<string, string>>({});

  useSyncOnChange([effective], () => {
    setDraft(Object.fromEntries(FIELDS.map((k) => [k, String(effective[k])])));
  });

  const save = useMutation({
    mutationFn: (cancellationPolicy: Partial<KiorexCancellationPolicy> | null) =>
      apiPut<KiorexSettingsDto>("/api/v1/kiorex/settings", { clinicId, cancellationPolicy }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kiorex", "settings", clinicId] });
      toast.success(t("kiorexTab.policy.saved", "Cancellation policy saved"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const onSave = () => {
    const next: Partial<KiorexCancellationPolicy> = {};
    for (const k of FIELDS) {
      const n = Number.parseInt(draft[k] ?? "", 10);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t("kiorexTab.policy.invalid", "Enter whole numbers of 0 or more."));
        return;
      }
      next[k] = n;
    }
    save.mutate(next);
  };

  return (
    <Card data-testid="kiorex-policy-card">
      <CardHeader>
        <CardTitle className="text-base">{t("kiorexTab.policy.title", "Reschedule & cancellation policy")}</CardTitle>
        <CardDescription>
          {t(
            "kiorexTab.policy.hint",
            "Applies to Kiorex and booking-link patients. Cancellations by the clinic always refund the deposit and need a reason the patient will see.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`kiorex-policy-${k}`}>{t(`kiorexTab.policy.${k}`)}</Label>
              <Input
                id={`kiorex-policy-${k}`}
                type="number"
                min={0}
                inputMode="numeric"
                className="ltr-nums"
                value={draft[k] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground ltr-nums">
                {t("kiorexTab.policy.marketDefault", "Market default: {{value}}", {
                  value: settings.cancellationPolicy.marketDefault[k],
                })}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSave} disabled={save.isPending}>
            {t("common.save", "Save")}
          </Button>
          {settings.cancellationPolicy.override ? (
            <Button type="button" variant="outline" onClick={() => save.mutate(null)} disabled={save.isPending}>
              {t("kiorexTab.policy.reset", "Use market default")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
