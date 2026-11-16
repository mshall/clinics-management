import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EtaIntegrationBanner } from "@/features/compliance/eta-integration-banner";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { VisitCollectionFields } from "@/components/visit-collection-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { apiPost, ApiError } from "@/lib/http";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  emptyVisitCollection,
  validateVisitCollection,
  visitCollectionToApi,
  type VisitCollectionValue,
} from "@/lib/visit-collection";
import { setPaymentFlowActive } from "@/lib/unsaved-work-registry";

type Props = {
  encounterId: string;
  clinicId: string;
  amount: number;
  currency: string;
  invalidateKeys?: (string | unknown[])[];
};

export function CollectVisitBalanceCard({ encounterId, clinicId, amount, currency, invalidateKeys = [] }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [collection, setCollection] = useState<VisitCollectionValue>(emptyVisitCollection);

  const collect = useMutation({
    mutationFn: () => {
      const err = validateVisitCollection(amount, collection, t);
      if (err) throw new Error(err);
      return apiPost<{ revenueEntryId: string; amount: number; currency: string }>(
        `/api/v1/front-desk/encounters/${encounterId}/collect-visit-balance`,
        { visitCollection: visitCollectionToApi(amount, collection) },
      );
    },
    onSuccess: () => {
      toast.success(t("frontDesk.balanceCollected", "Visit balance collected"));
      void qc.invalidateQueries({ queryKey: ["encounter", encounterId] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      for (const k of invalidateKeys) {
        if (Array.isArray(k)) void qc.invalidateQueries({ queryKey: k });
        else void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError || e instanceof Error ? apiErrorMessage(e) : String(e)),
  });

  useEffect(() => {
    if (!collect.isPending) return;
    setPaymentFlowActive(true);
    return () => setPaymentFlowActive(false);
  }, [collect.isPending]);

  if (amount <= 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("frontDesk.visitBalanceDue", "Visit balance due")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          {formatMoneyAmount(amount, currency, localeForLanguage(i18n.language))} ·{" "}
          {t("frontDesk.visitBalanceReceivableHint", "Receivable until collected — not counted as posted revenue.")}
        </p>
        <EtaIntegrationBanner clinicId={clinicId} />
        <VisitCollectionFields amount={amount} value={collection} onChange={setCollection} />
        <Button type="button" disabled={collect.isPending} onClick={() => collect.mutate()}>
          {t("frontDesk.collectBalance", "Collect balance")}
        </Button>
      </CardContent>
    </Card>
  );
}