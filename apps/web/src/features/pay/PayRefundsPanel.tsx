import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error-message";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { canApprovePatientMoney } from "@/lib/patient-money-policy";
import { useAuthStore } from "@/stores/auth-store";
import { useDecideRefund, useRefunds, useRequestRefund } from "./pay-api";
import { stateTone } from "./pay-logic";
import { Pill, TD, TH, Tbl } from "./pay-ui";

/** Refund requests: the list (with who may approve) and a request form. Approval limits and the money rules are the server's; refunds above the limit wait for an approver. */
export function PayRefundsPanel() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const user = useAuthStore((s) => s.user);
  const approver = canApprovePatientMoney(user);
  const q = useRefunds();
  const req = useRequestRefund();
  const decide = useDecideRefund();
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-4" data-testid="pay-refunds">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pay.r.list")}</CardTitle><CardDescription>{t("pay.r.approvalNote")}</CardDescription></CardHeader>
        <CardContent>
          {q.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("pay.loading")}</p> : null}
          {q.isError ? <p role="alert" className="text-sm text-destructive">{t("pay.loadError")}</p> : null}
          {q.data && q.data.items.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="pay-refunds-empty">{t("pay.r.empty")}</p> : null}
          {q.data && q.data.items.length > 0 ? (
            <Tbl label={t("pay.r.list")} testid="pay-refund-list">
              <thead><tr><TH>{t("pay.r.colAmount")}</TH><TH>{t("pay.r.colReason")}</TH><TH>{t("pay.r.colStatus")}</TH><TH>{t("pay.r.colDate")}</TH><TH>{t("pay.m.colActions")}</TH></tr></thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id} data-status={r.status}>
                    <TD className="ltr-nums font-medium">{formatMoneyAmount(r.amount, r.currency, locale)}</TD>
                    <TD>{r.reason}</TD>
                    <TD><Pill tone={stateTone(r.status)}>{t(`pay.r.status.${r.status}`, { defaultValue: r.status })}</Pill></TD>
                    <TD className="ltr-nums">{new Date(r.createdAt).toLocaleDateString(locale)}</TD>
                    <TD>{r.status === "PENDING_APPROVAL" && approver ? <div className="flex gap-2"><Button size="sm" className="min-h-11" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "approve" })}>{t("pay.r.approve")}</Button><Button size="sm" variant="ghost" className="min-h-11" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "reject" })}>{t("pay.r.rejectIt")}</Button></div> : null}</TD>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pay.r.request")}</CardTitle></CardHeader>
        <CardContent>
          <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); setSent(false); req.mutate({ paymentId: paymentId.trim(), amount: Number(amount), reason: reason.trim() }, { onSuccess: () => { setSent(true); setPaymentId(""); setAmount(""); setReason(""); } }); }}>
            <label className="grid gap-1 text-sm"><span>{t("pay.r.paymentId")}</span><Input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} dir="ltr" data-testid="pay-refund-payment" /></label>
            <label className="grid gap-1 text-sm"><span>{t("pay.r.amount")}</span><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" data-testid="pay-refund-amount" /></label>
            <label className="grid gap-1 text-sm"><span>{t("pay.r.reason")}</span><Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="pay-refund-reason" /></label>
            <Button type="submit" className="min-h-11" disabled={req.isPending || !paymentId.trim() || !(Number(amount) > 0) || !reason.trim()} data-testid="pay-refund-submit">{t("pay.r.submit")}</Button>
            {req.isError ? <p role="alert" className="text-sm text-destructive" data-testid="pay-refund-error">{apiErrorMessage(req.error, t)}</p> : null}
            {sent ? <p role="status" className="text-sm" data-testid="pay-refund-sent">{t("pay.r.sent")}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
