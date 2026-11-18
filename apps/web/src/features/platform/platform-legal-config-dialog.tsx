import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/http";

export type LegalConfig = {
  crossBorderTransfer?: {
    approvalRef: string;
    issuedAt: string;
    expiresAt: string;
    destination: string;
    scope?: string;
    subProcessors: string[];
  };
  pilotException?: {
    active: boolean;
    legalRef: string;
    note?: string;
    expiresAt?: string;
  };
};

type LegalConfigResponse = {
  config: LegalConfig;
  crossBorderRequired: boolean;
  launchApproved: boolean;
  daysUntilExpiry: number | null;
};

type Props = {
  marketId: string | null;
  marketLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SUB_PROCESSORS = ["aws-eu-central-1", "openai-eu", "whatsapp-bsp", "ses-eu", "paymob"] as const;

export function PlatformLegalConfigDialog({ marketId, marketLabel, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LegalConfig>({});

  const configQuery = useQuery({
    queryKey: ["platform", "markets", marketId, "legal-config"],
    queryFn: () => apiGet<LegalConfigResponse>(`/api/v1/admin/platform/markets/${marketId!}/legal-config`),
    enabled: open && Boolean(marketId),
  });

  useEffect(() => {
    if (configQuery.data?.config) {
      setDraft(structuredClone(configQuery.data.config));
    }
  }, [configQuery.data]);

  const saveMut = useMutation({
    mutationFn: (body: LegalConfig) =>
      apiPut<LegalConfigResponse>(`/api/v1/admin/platform/markets/${encodeURIComponent(marketId!)}/legal-config`, body),
    onSuccess: () => {
      toast.success(t("platform.legal.saved", "Legal config saved"));
      void qc.invalidateQueries({ queryKey: ["platform", "markets"] });
      void qc.invalidateQueries({ queryKey: ["platform", "markets", marketId, "legal-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cbt = draft.crossBorderTransfer ?? {
    approvalRef: "",
    issuedAt: "",
    expiresAt: "",
    destination: "DE (eu-central-1)",
    subProcessors: [...SUB_PROCESSORS],
  };
  const pilot = draft.pilotException ?? { active: false, legalRef: "" };

  const toggleSub = (id: string, checked: boolean) => {
    const set = new Set(cbt.subProcessors);
    if (checked) set.add(id);
    else set.delete(id);
    setDraft({
      ...draft,
      crossBorderTransfer: { ...cbt, subProcessors: [...set] },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("platform.legal.title", "Cross-border legal config")}
            {marketLabel ? ` · ${marketLabel}` : ""}
          </DialogTitle>
        </DialogHeader>
        {configQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
        ) : (
          <div className="space-y-4">
            {configQuery.data?.crossBorderRequired ? (
              <p
                className={
                  configQuery.data.launchApproved
                    ? "text-sm text-emerald-700 dark:text-emerald-400"
                    : "text-sm text-amber-700 dark:text-amber-400"
                }
              >
                {configQuery.data.launchApproved
                  ? t("platform.legal.approved", "Recorded approval satisfies the launch gate.")
                  : t("platform.legal.missing", "Approval reference or active pilot exception required before live PHI.")}
                {configQuery.data.daysUntilExpiry != null
                  ? ` ${t("platform.legal.expiresIn", "Expires in {{days}} days.", {
                      days: configQuery.data.daysUntilExpiry,
                    })}`
                  : null}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("platform.legal.notRequired", "This market has no cross-border launch gate.")}
              </p>
            )}

            <section className="space-y-2 rounded-md border p-3">
              <Label>{t("platform.legal.approvalRef", "Approval reference")}</Label>
              <Input
                value={cbt.approvalRef}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    crossBorderTransfer: { ...cbt, approvalRef: e.target.value },
                  })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("platform.legal.issuedAt", "Issued")}</Label>
                  <Input
                    type="date"
                    value={cbt.issuedAt}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        crossBorderTransfer: { ...cbt, issuedAt: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("platform.legal.expiresAt", "Expires")}</Label>
                  <Input
                    type="date"
                    value={cbt.expiresAt}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        crossBorderTransfer: { ...cbt, expiresAt: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <Label>{t("platform.legal.destination", "Destination")}</Label>
              <Input
                value={cbt.destination}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    crossBorderTransfer: { ...cbt, destination: e.target.value },
                  })
                }
              />
              <Label>{t("platform.legal.subProcessors", "Approved sub-processors")}</Label>
              <ul className="space-y-1 text-sm">
                {SUB_PROCESSORS.map((id) => (
                  <li key={id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cbt.subProcessors.includes(id)}
                        onChange={(e) => toggleSub(id, e.target.checked)}
                      />
                      <span className="font-mono text-xs">{id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={pilot.active}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      pilotException: { ...pilot, active: e.target.checked },
                    })
                  }
                />
                {t("platform.legal.pilotActive", "Legal pilot exception (closed pilot only)")}
              </label>
              <Input
                placeholder={t("platform.legal.pilotRef", "Legal sign-off reference")}
                value={pilot.legalRef}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pilotException: { ...pilot, legalRef: e.target.value },
                  })
                }
              />
            </section>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate(draft)}>
                {t("common.save", "Save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}