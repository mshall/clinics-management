import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error-message";
import { apiPost, ApiError } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { setPaymentFlowActive } from "@/lib/unsaved-work-registry";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

export type SplitMethod = "CASH" | "CARD" | "TRANSFER" | "WALLET" | "OTHER";
const METHODS: SplitMethod[] = ["CASH", "CARD", "TRANSFER", "WALLET"];

type Row = { method: SplitMethod; amount: string; reference: string; channel: string };

export type SplitTarget =
  | { kind: "VISIT"; encounterId: string }
  | { kind: "OPERATION"; operationId: string }
  | { kind: "SERVICE"; description: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicId: string;
  patientId: string;
  balance: number;
  currency: string;
  target: SplitTarget;
  invalidateKeys?: (string | unknown[])[];
  onPaid?: (result: { paymentId: string; remainingBalance: number }) => void;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** MN-06 — front-desk split payment: cash + card + InstaPay in one receipt; one revenue row per method. */
export function SplitPaymentDialog({
  open,
  onOpenChange,
  clinicId,
  patientId,
  balance,
  currency,
  target,
  invalidateKeys = [],
  onPaid,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([
    { method: "CASH", amount: "", reference: "", channel: "" },
    { method: "CARD", amount: "", reference: "", channel: "" },
  ]);
  const [serviceDesc, setServiceDesc] = useState(target.kind === "SERVICE" ? target.description : "");

  useSyncOnChange([open, balance, target.kind, target.kind === "SERVICE" ? target.description : null], () => {
    if (!open) return;
    setRows([
      { method: "CASH", amount: balance > 0 ? String(round2(balance / 2)) : "", reference: "", channel: "" },
      { method: "CARD", amount: balance > 0 ? String(round2(balance - round2(balance / 2))) : "", reference: "", channel: "" },
    ]);
    if (target.kind === "SERVICE") setServiceDesc(target.description);
  });

  const total = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const remainder = round2(balance - total);

  const pay = useMutation({
    mutationFn: async () => {
      const allocations = rows
        .map((r) => ({
          method: r.method,
          amount: round2(Number(r.amount)),
          reference: r.reference.trim() || undefined,
          channel: r.method === "WALLET" || r.method === "TRANSFER" ? r.channel.trim() || r.method : undefined,
        }))
        .filter((a) => a.amount > 0);
      if (!allocations.length) throw new Error(t("splitPayment.needParts", "Add at least one payment amount"));
      if (balance > 0 && total > balance + 0.001) {
        throw new Error(t("splitPayment.overBalance", "The parts add up to more than the balance"));
      }
      const bodyTarget =
        target.kind === "SERVICE"
          ? { kind: "SERVICE" as const, description: serviceDesc.trim() }
          : target;
      if (bodyTarget.kind === "SERVICE" && !bodyTarget.description) {
        throw new Error(t("splitPayment.descriptionRequired", "Describe the service being paid for"));
      }
      return apiPost<{ paymentId: string; remainingBalance: number; total: number }>("/api/v1/billing/split-payments", {
        clinicId,
        patientId,
        allocations,
        target: bodyTarget,
      });
    },
    onSuccess: (data) => {
      toast.success(t("splitPayment.recorded", "Split payment recorded"));
      onOpenChange(false);
      onPaid?.(data);
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["installments"] });
      for (const k of invalidateKeys) {
        if (Array.isArray(k)) void qc.invalidateQueries({ queryKey: k });
        else void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError || e instanceof Error ? apiErrorMessage(e) : String(e)),
  });

  useEffect(() => {
    if (!pay.isPending) return;
    setPaymentFlowActive(true);
    return () => setPaymentFlowActive(false);
  }, [pay.isPending]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="split-payment-dialog">
        <DialogHeader>
          <DialogTitle>{t("splitPayment.title", "Split payment")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {balance > 0 ? (
            <p className="ltr-nums text-muted-foreground">
              {t("splitPayment.balance", "Balance due")}: {formatMoneyAmount(balance, currency, locale)}
            </p>
          ) : null}
          {target.kind === "SERVICE" ? (
            <div className="space-y-1">
              <Label required>{t("splitPayment.description", "Service description")}</Label>
              <Input value={serviceDesc} onChange={(e) => setServiceDesc(e.target.value)} data-testid="split-service-desc" />
            </div>
          ) : null}
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]" data-testid={`split-row-${i}`}>
                <div className="space-y-1">
                  <Label>{t("splitPayment.method", "Method")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={r.method}
                    onChange={(e) => setRow(i, { method: e.target.value as SplitMethod })}
                    aria-label={t("splitPayment.method", "Method")}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`splitPayment.methods.${m}`, m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{t("splitPayment.amount", "Amount")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="ltr-nums"
                    value={r.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                    data-testid={`split-amount-${i}`}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rows.length <= 1}
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={t("splitPayment.removePart", "Remove part")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {r.method === "TRANSFER" || r.method === "WALLET" ? (
                  <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>{t("splitPayment.channel", "Channel")}</Label>
                      <Input
                        value={r.channel}
                        placeholder={r.method === "WALLET" ? "INSTAPAY" : "BANK"}
                        onChange={(e) => setRow(i, { channel: e.target.value })}
                        data-testid={`split-channel-${i}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("splitPayment.reference", "Reference")}</Label>
                      <Input value={r.reference} onChange={(e) => setRow(i, { reference: e.target.value })} data-testid={`split-ref-${i}`} />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { method: "CASH", amount: "", reference: "", channel: "" }])}
            data-testid="split-add-part"
          >
            <Plus className="me-1 h-4 w-4" />
            {t("splitPayment.addPart", "Add method")}
          </Button>
          <p className="ltr-nums text-muted-foreground" data-testid="split-total">
            {t("splitPayment.total", "Total")}: {formatMoneyAmount(total, currency, locale)}
            {balance > 0 ? (
              <>
                {" · "}
                {t("splitPayment.remaining", "Remaining")}: {formatMoneyAmount(Math.max(0, remainder), currency, locale)}
              </>
            ) : null}
          </p>
          <Button type="button" className="w-full" disabled={pay.isPending || total <= 0} onClick={() => pay.mutate()} data-testid="split-submit">
            {t("splitPayment.submit", "Record split payment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
