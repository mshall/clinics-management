import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPostFormData } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";

type PayMethod = "saved_card" | "fawry" | "instapay" | "bank";

export function AdminKiorlyPayDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  amountDue,
  currency,
  paymentUnderReview,
  onPaymentStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  amountDue: string;
  currency: string;
  paymentUnderReview?: boolean;
  onPaymentStarted?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [method, setMethod] = useState<PayMethod>("saved_card");
  const [fawryCode, setFawryCode] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);

  const payMut = useMutation({
    mutationFn: async (body: { method: PayMethod; proofUploadKey?: string }) =>
      apiPost<{
        status: string;
        referenceCode?: string;
        paymentId?: string;
        instructionsEn?: string;
      }>(`/api/v1/billing/invoices/${invoiceId}/pay`, body),
    onSuccess: (data) => {
      if (data.referenceCode) setFawryCode(data.referenceCode);
      if (data.paymentId) setPendingPaymentId(data.paymentId);
      if (data.status === "UNDER_REVIEW") {
        toast.message(t("admin.billing.invoices.payUnderReview", "Payment submitted for review"));
      } else if (data.status === "SUCCEEDED") {
        toast.success(t("admin.billing.invoices.paid", "Payment recorded"));
        onOpenChange(false);
      } else {
        toast.message(t("admin.billing.invoices.payPending", "Payment initiated"));
      }
      void qc.invalidateQueries({ queryKey: ["billing", "invoices"] });
      onPaymentStarted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!pendingPaymentId) return;
    const timer = setInterval(() => {
      void apiGet<{ status: string }>(`/api/v1/billing/payments/${pendingPaymentId}/status`).then((s) => {
        if (s.status === "SUCCEEDED") {
          toast.success(t("admin.billing.invoices.paid", "Payment recorded"));
          setPendingPaymentId(null);
          onOpenChange(false);
          void qc.invalidateQueries({ queryKey: ["billing", "invoices"] });
        }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingPaymentId, onOpenChange, qc, t]);

  async function onUploadProof(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const { proofUploadKey } = await apiPostFormData<{ proofUploadKey: string }>(
      "/api/v1/billing/payments/proof",
      fd,
      { enhance: false },
    );
    payMut.mutate({ method, proofUploadKey });
  }

  async function startCardSession() {
    const session = await apiPost<{ iframeUrl: string }>("/api/v1/billing/payment-methods/card-session", {
      returnUrl: window.location.href,
    });
    window.open(session.iframeUrl, "_blank", "noopener,noreferrer");
    toast.message(t("admin.billing.invoices.cardSession", "Complete card entry in the secure Paymob window"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.billing.invoices.payTitle", "Pay invoice")}</DialogTitle>
          <DialogDescription>
            {invoiceNumber} — {amountDue} {currency}
            {paymentUnderReview ? (
              <span className="mt-2 block text-[hsl(var(--warning))] ">
                {t("admin.billing.invoices.underReviewBanner", "Payment under review — dunning paused")}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("admin.billing.invoices.payMethod", "Method")}</Label>
            <select
              className={nativeSelectClassName}
              value={method}
              onChange={(e) => setMethod(e.target.value as PayMethod)}
            >
              <option value="saved_card">{t("admin.billing.invoices.methodCard", "Saved card")}</option>
              <option value="fawry">{t("admin.billing.invoices.methodFawry", "Fawry")}</option>
              <option value="instapay">{t("admin.billing.invoices.methodInstapay", "InstaPay")}</option>
              <option value="bank">{t("admin.billing.invoices.methodBank", "Bank transfer")}</option>
            </select>
          </div>

          {method === "saved_card" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={payMut.isPending} onClick={() => payMut.mutate({ method: "saved_card" })}>
                {t("admin.billing.invoices.chargeCard", "Charge default card")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void startCardSession()}>
                {t("admin.billing.invoices.addCard", "Add card (hosted)")}
              </Button>
            </div>
          ) : null}

          {method === "fawry" ? (
            <Button type="button" size="sm" disabled={payMut.isPending} onClick={() => payMut.mutate({ method: "fawry" })}>
              {t("admin.billing.invoices.getFawryCode", "Get Fawry code")}
            </Button>
          ) : null}

          {fawryCode ? (
            <p className="text-sm font-mono">
              {t("admin.billing.invoices.fawryCode", "Fawry reference")}: {fawryCode}
            </p>
          ) : null}

          {method === "instapay" || method === "bank" ? (
            <div className="space-y-2">
              <Label htmlFor="proof">{t("admin.billing.invoices.proof", "Upload proof")}</Label>
              <input
                id="proof"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadProof(f);
                }}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}