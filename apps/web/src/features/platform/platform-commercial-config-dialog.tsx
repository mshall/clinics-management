import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

export type CommercialConfig = {
  trial: {
    standardDays: number;
    foundingDays: number;
    activation: { minVisits: number; withinDays: number };
    commissionPolicy: string;
    cohorts?: Array<{ key: string; trialDays: number }>;
  };
  kiorex: {
    newPatientLookbackMonths: number;
    disputeWindowDays: number;
    benchmarkTargetRatio: number;
    autoConfirmHours: number;
  };
  lite: { commissionMonthlyCap: number | null; minInvoice: number };
  dunning: { graceDays: number; readOnlyAfterDays: number; suspendAfterDays: number };
  referral: { rewardMonths: number; expiryMonths: number; maxPerYear: number };
};

type CommercialConfigResponse = { config: CommercialConfig; source: string };

type Props = {
  marketId: string | null;
  marketLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PlatformCommercialConfigDialog({ marketId, marketLabel, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CommercialConfig | null>(null);
  const [previewKeys, setPreviewKeys] = useState<string[]>([]);

  const configQuery = useQuery({
    queryKey: ["platform", "markets", marketId, "commercial-config"],
    queryFn: () => apiGet<CommercialConfigResponse>(`/api/v1/admin/platform/markets/${marketId!}/commercial-config`),
    enabled: open && Boolean(marketId),
  });

  useSyncOnChange([configQuery.data], () => {
    if (configQuery.data?.config) {
      setDraft(structuredClone(configQuery.data.config));
      setPreviewKeys([]);
    }
  });

  const previewMut = useMutation({
    mutationFn: (body: CommercialConfig) =>
      apiPost<{ changedKeys: string[] }>(
        `/api/v1/admin/platform/markets/${encodeURIComponent(marketId!)}/commercial-config/preview`,
        body,
      ),
    onSuccess: (data) => {
      setPreviewKeys(data.changedKeys);
      toast.message(t("platform.commercial.previewReady", "Preview updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (body: CommercialConfig) =>
      apiPut<{ preview: { changedKeys: string[] } }>(
        `/api/v1/admin/platform/markets/${encodeURIComponent(marketId!)}/commercial-config`,
        body,
      ),
    onSuccess: (data) => {
      toast.success(t("platform.commercial.saved", "Commercial config saved"));
      setPreviewKeys(data.preview.changedKeys);
      void qc.invalidateQueries({ queryKey: ["platform", "markets", marketId, "commercial-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open || !marketId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("platform.commercial.title", "Commercial config")}
            {marketLabel ? ` — ${marketLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        {configQuery.isPending || !draft ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <section className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{t("platform.commercial.trial", "Trial")}</h3>
              <p className="text-xs text-muted-foreground">{t("platform.commercial.trialHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("platform.commercial.standardDays")}</Label>
                  <Input
                    type="number"
                    value={draft.trial.standardDays}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trial: { ...draft.trial, standardDays: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("platform.commercial.foundingDays")}</Label>
                  <Input
                    type="number"
                    value={draft.trial.foundingDays}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trial: { ...draft.trial, foundingDays: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("platform.commercial.minVisits")}</Label>
                  <Input
                    type="number"
                    value={draft.trial.activation.minVisits}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trial: {
                          ...draft.trial,
                          activation: { ...draft.trial.activation, minVisits: Number(e.target.value) || 0 },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("platform.commercial.withinDays")}</Label>
                  <Input
                    type="number"
                    value={draft.trial.activation.withinDays}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trial: {
                          ...draft.trial,
                          activation: { ...draft.trial.activation, withinDays: Number(e.target.value) || 0 },
                        },
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("platform.commercial.commissionPolicy")}</Label>
                  <select
                    className={nativeSelectClassName}
                    value={draft.trial.commissionPolicy}
                    onChange={(e) =>
                      setDraft({ ...draft, trial: { ...draft.trial, commissionPolicy: e.target.value } })
                    }
                  >
                    <option value="WAIVE_UP_TO_PLAN_PRICE">{t("platform.commercial.policyWaiveUpToPlan")}</option>
                    <option value="WAIVE_ALL">{t("platform.commercial.policyWaiveAll")}</option>
                    <option value="CHARGE">{t("platform.commercial.policyCharge")}</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{t("platform.commercial.kiorex", "Kiorex")}</h3>
              <p className="text-xs text-muted-foreground">{t("platform.commercial.kiorexHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label={t("platform.commercial.lookbackMonths")}
                  value={draft.kiorex.newPatientLookbackMonths}
                  onChange={(n) => setDraft({ ...draft, kiorex: { ...draft.kiorex, newPatientLookbackMonths: n } })}
                />
                <NumberField
                  label={t("platform.commercial.disputeDays")}
                  value={draft.kiorex.disputeWindowDays}
                  onChange={(n) => setDraft({ ...draft, kiorex: { ...draft.kiorex, disputeWindowDays: n } })}
                />
                <NumberField
                  label={t("platform.commercial.benchmarkRatio")}
                  value={draft.kiorex.benchmarkTargetRatio}
                  step="0.01"
                  onChange={(n) => setDraft({ ...draft, kiorex: { ...draft.kiorex, benchmarkTargetRatio: n } })}
                />
                <NumberField
                  label={t("platform.commercial.autoConfirmHours")}
                  value={draft.kiorex.autoConfirmHours}
                  onChange={(n) => setDraft({ ...draft, kiorex: { ...draft.kiorex, autoConfirmHours: n } })}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{t("platform.commercial.lite", "Lite")}</h3>
              <p className="text-xs text-muted-foreground">{t("platform.commercial.liteHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label={t("platform.commercial.minInvoice")}
                  value={draft.lite.minInvoice}
                  onChange={(n) => setDraft({ ...draft, lite: { ...draft.lite, minInvoice: n } })}
                />
                <div>
                  <Label>{t("platform.commercial.commissionCap")}</Label>
                  <Input
                    type="number"
                    placeholder={t("platform.commercial.noCap")}
                    value={draft.lite.commissionMonthlyCap ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setDraft({
                        ...draft,
                        lite: {
                          ...draft.lite,
                          commissionMonthlyCap: raw === "" ? null : Number(raw) || 0,
                        },
                      });
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{t("platform.commercial.dunning", "Dunning")}</h3>
              <p className="text-xs text-muted-foreground">{t("platform.commercial.dunningHint")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label={t("platform.commercial.graceDays")}
                  value={draft.dunning.graceDays}
                  onChange={(n) => setDraft({ ...draft, dunning: { ...draft.dunning, graceDays: n } })}
                />
                <NumberField
                  label={t("platform.commercial.readOnlyAfter")}
                  value={draft.dunning.readOnlyAfterDays}
                  onChange={(n) => setDraft({ ...draft, dunning: { ...draft.dunning, readOnlyAfterDays: n } })}
                />
                <NumberField
                  label={t("platform.commercial.suspendAfter")}
                  value={draft.dunning.suspendAfterDays}
                  onChange={(n) => setDraft({ ...draft, dunning: { ...draft.dunning, suspendAfterDays: n } })}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{t("platform.commercial.referral", "Referral")}</h3>
              <p className="text-xs text-muted-foreground">{t("platform.commercial.referralHint")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label={t("platform.commercial.rewardMonths")}
                  value={draft.referral.rewardMonths}
                  onChange={(n) => setDraft({ ...draft, referral: { ...draft.referral, rewardMonths: n } })}
                />
                <NumberField
                  label={t("platform.commercial.expiryMonths")}
                  value={draft.referral.expiryMonths}
                  onChange={(n) => setDraft({ ...draft, referral: { ...draft.referral, expiryMonths: n } })}
                />
                <NumberField
                  label={t("platform.commercial.maxPerYear")}
                  value={draft.referral.maxPerYear}
                  onChange={(n) => setDraft({ ...draft, referral: { ...draft.referral, maxPerYear: n } })}
                />
              </div>
            </section>

            {previewKeys.length ? (
              <p className="text-xs text-muted-foreground">
                {t("platform.commercial.changedKeys", "Changed: {{keys}}", { keys: previewKeys.join(", ") })}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => previewMut.mutate(draft)} disabled={previewMut.isPending}>
                {t("platform.commercial.preview", "Preview changes")}
              </Button>
              <Button type="button" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
                {t("common.save", "Save")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}
