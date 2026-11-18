import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { VisitCollectionFields } from "@/components/visit-collection-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { apiPost, apiPostFormData, ApiError } from "@/lib/http";
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
  preferredTransferChannel?: string | null;
  requiresTransferReceipt?: boolean;
  invalidateKeys?: (string | unknown[])[];
};

export function CollectVisitBalanceCard({
  encounterId,
  amount,
  currency,
  preferredTransferChannel,
  requiresTransferReceipt = false,
  invalidateKeys = [],
}: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [collection, setCollection] = useState<VisitCollectionValue>(() => ({
    ...emptyVisitCollection(),
    mode: requiresTransferReceipt ? "MONEY_TRANSFER" : "CASH_ON_VISIT",
    transferChannel: preferredTransferChannel ?? "",
  }));
  const [receipt, setReceipt] = useState<File | null>(null);

  useEffect(() => {
    if (preferredTransferChannel?.trim()) {
      setCollection((c) => ({
        ...c,
        mode: "MONEY_TRANSFER",
        transferChannel: preferredTransferChannel,
      }));
    }
  }, [preferredTransferChannel]);

  const needsReceipt =
    requiresTransferReceipt || collection.mode === "MONEY_TRANSFER";

  const collect = useMutation({
    mutationFn: async () => {
      const err = validateVisitCollection(amount, collection, t);
      if (err) throw new Error(err);
      if (needsReceipt && !receipt) {
        throw new Error(
          t(
            "frontDesk.transferReceiptRequired",
            "Upload the transfer payment receipt (PDF or image) to mark this fee as collected.",
          ),
        );
      }
      const visitCollection = visitCollectionToApi(amount, collection);
      if (needsReceipt && receipt) {
        const fd = new FormData();
        fd.append("receipt", receipt);
        fd.append("visitCollection", JSON.stringify({ visitCollection: visitCollection ?? {} }));
        return apiPostFormData<{ revenueEntryId: string; amount: number; currency: string; message?: string }>(
          `/api/v1/front-desk/encounters/${encounterId}/collect-visit-balance-with-receipt`,
          fd,
          { enhance: false },
        );
      }
      return apiPost<{ revenueEntryId: string; amount: number; currency: string }>(
        `/api/v1/front-desk/encounters/${encounterId}/collect-visit-balance`,
        { visitCollection },
      );
    },
    onSuccess: (data) => {
      const msg =
        "message" in data && typeof data.message === "string"
          ? data.message
          : t("frontDesk.balanceCollected", "Visit balance collected");
      toast.success(msg);
      setReceipt(null);
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
          {requiresTransferReceipt
            ? t(
                "frontDesk.visitBalanceTransferDue",
                "Payment channel fee — collect with transaction ID and receipt before completing the visit.",
              )
            : t("frontDesk.visitBalanceReceivableHint", "Receivable until collected — not counted as posted revenue.")}
        </p>
        <VisitCollectionFields amount={amount} value={collection} onChange={setCollection} />
        {needsReceipt ? (
          <div className="space-y-1">
            <Label required>{t("frontDesk.transferReceipt", "Payment receipt")}</Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              {t("frontDesk.transferReceiptHint", "Upload the bank transfer or wallet screenshot/PDF.")}
            </p>
          </div>
        ) : null}
        <Button type="button" disabled={collect.isPending} onClick={() => collect.mutate()}>
          {t("frontDesk.collectBalance", "Collect balance")}
        </Button>
      </CardContent>
    </Card>
  );
}