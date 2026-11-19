import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, PiggyBank } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEntitlement } from "@/hooks/use-entitlement";
import { apiErrorMessage } from "@/lib/api-error-message";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { canUsePatientMoney } from "@/lib/patient-money-policy";
import { useAuthStore } from "@/stores/auth-store";

type Requirement = {
  required: boolean;
  reasons: string[];
  amount: number;
  currency: string;
  kiorexPayAvailable: boolean;
  deposit: { id: string; status: string; amount: number; linkExpiresAt: string | null; source: string } | null;
};

type CreatedLink = { depositId: string; url: string; amount: number; currency: string; expiresAt: string; sent: boolean; sendError: string | null };

const DESK_METHODS = ["TRANSFER", "WALLET", "CARD", "CASH"] as const;

/** FS-04 — deposit rules, payment link and desk confirmation on an upcoming appointment. */
export function DepositPanel({ appointmentId, upcoming }: { appointmentId: string; upcoming: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const user = useAuthStore((s) => s.user);
  const entitled = useEntitlement("deposits");
  const allowed = entitled && canUsePatientMoney(user);
  const qc = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);

  const q = useQuery({
    queryKey: ["deposit-requirement", appointmentId],
    queryFn: () => apiGet<Requirement>(`/api/v1/appointments/${appointmentId}/deposit-requirement`),
    enabled: allowed,
    retry: false,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["deposit-requirement", appointmentId] });
    void qc.invalidateQueries({ queryKey: ["appointment", appointmentId] });
    void qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  if (!allowed || !q.data) return null;
  const r = q.data;
  const dep = r.deposit;
  const pending = dep?.status === "PENDING";
  if (!dep && (!upcoming || !r.required) && !created) {
    return upcoming ? (
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)} data-testid="deposit-ask-optional">
          <PiggyBank className="me-1 h-4 w-4" aria-hidden />
          {t("depositPanel.ask", "Ask for a deposit")}
        </Button>
        <DepositLinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          appointmentId={appointmentId}
          requirement={r}
          onCreated={(c) => {
            setCreated(c);
            refresh();
          }}
        />
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40" data-testid="deposit-panel">
      {!dep && r.required ? (
        <p className="font-medium" data-testid="deposit-required">
          {t("depositPanel.required", "Deposit required")}:{" "}
          <span className="ltr-nums">{formatMoneyAmount(r.amount, r.currency, locale)}</span> ·{" "}
          {r.reasons.map((x) => t(`depositPanel.reason.${x}`, x)).join(" · ")}
        </p>
      ) : null}
      {pending && dep?.linkExpiresAt ? (
        <p>
          {t("depositPanel.awaiting", "Payment link sent — awaiting payment until")}{" "}
          <span className="ltr-nums">{new Date(dep.linkExpiresAt).toLocaleString(locale)}</span>
        </p>
      ) : null}
      {created ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="deposit-link-created">
          <code className="max-w-full truncate rounded bg-background px-2 py-1 text-xs" dir="ltr">
            {created.url}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(created.url)}
            aria-label={t("depositPanel.copy", "Copy link")}
          >
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
          <span className="text-xs text-muted-foreground">
            {created.sent
              ? t("depositPanel.sentWhatsApp", "Sent on WhatsApp")
              : t("depositPanel.notSent", "Not sent — copy the link and share it with the patient")}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {upcoming && (!dep || pending) ? (
          <Button size="sm" variant={pending ? "outline" : "default"} onClick={() => setLinkOpen(true)} data-testid="deposit-send-link">
            <Link2 className="me-1 h-4 w-4" aria-hidden />
            {pending ? t("depositPanel.resend", "Send a new link") : t("depositPanel.sendLink", "Send payment link")}
          </Button>
        ) : null}
        {pending && dep?.source === "PAYMENT_LINK" ? (
          <Button size="sm" onClick={() => setPaidOpen(true)} data-testid="deposit-mark-paid">
            {t("depositPanel.markPaid", "Mark as paid")}
          </Button>
        ) : null}
      </div>
      <DepositLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        appointmentId={appointmentId}
        requirement={r}
        onCreated={(c) => {
          setCreated(c);
          refresh();
        }}
      />
      {dep ? (
        <MarkPaidDialog
          open={paidOpen}
          onOpenChange={setPaidOpen}
          depositId={dep.id}
          onDone={() => {
            setCreated(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function DepositLinkDialog({
  open,
  onOpenChange,
  appointmentId,
  requirement,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointmentId: string;
  requirement: Requirement;
  onCreated: (c: CreatedLink) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(requirement.amount || ""));
  const [provider, setProvider] = useState<"CLINIC" | "KIOREX_PAY">("CLINIC");
  const m = useMutation({
    mutationFn: () =>
      apiPost<CreatedLink>(`/api/v1/appointments/${appointmentId}/deposit-link`, { amount: Number(amount), provider }),
    onSuccess: (c) => {
      onCreated(c);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("depositPanel.dialogTitle", "Send a deposit payment link")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="deposit-link-amount">
              {t("depositPanel.amount", "Deposit amount")} ({requirement.currency})
            </Label>
            <Input id="deposit-link-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {requirement.kiorexPayAvailable ? (
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {(["CLINIC", "KIOREX_PAY"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={provider === p}
                  variant={provider === p ? "default" : "outline"}
                  className="min-h-11"
                  onClick={() => setProvider(p)}
                >
                  {p === "CLINIC" ? t("depositPanel.providerClinic", "Pay the clinic (InstaPay / transfer)") : t("payment.kiorexPay", "Kiorex Pay")}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("depositPanel.dialogHint", "The patient gets the link on WhatsApp. Unpaid links expire per the clinic deposit policy.")}
          </p>
          {m.isError ? <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p> : null}
          <Button className="w-full min-h-11" disabled={m.isPending || !(Number(amount) > 0)} onClick={() => m.mutate()}>
            {t("depositPanel.send", "Send link")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({
  open,
  onOpenChange,
  depositId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  depositId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<(typeof DESK_METHODS)[number]>("TRANSFER");
  const [reference, setReference] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost(`/api/v1/billing/deposits/${depositId}/mark-paid`, { method, reference: reference.trim() || undefined }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
    },
  });
  const needsRef = method !== "CASH";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("depositPanel.markPaidTitle", "Confirm deposit payment")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {DESK_METHODS.map((x) => (
              <Button
                key={x}
                type="button"
                role="radio"
                aria-checked={method === x}
                variant={method === x ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setMethod(x)}
              >
                {t(`patientMoney.method.${x}`)}
              </Button>
            ))}
          </div>
          {needsRef ? (
            <div className="space-y-1">
              <Label htmlFor="deposit-paid-ref">{t("depositPanel.reference", "Transaction reference")}</Label>
              <Input id="deposit-paid-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          ) : null}
          {m.isError ? <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p> : null}
          <Button className="w-full min-h-11" disabled={m.isPending || (needsRef && !reference.trim())} onClick={() => m.mutate()}>
            {t("depositPanel.confirmPaid", "Confirm payment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
