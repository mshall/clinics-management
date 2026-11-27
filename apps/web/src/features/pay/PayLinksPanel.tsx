import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error-message";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { type CreatedLink, useCancelLink, useCreateLink, useInvoiceSearch, useInvoiceStatus, useLinks, useRequestRefund } from "./pay-api";
import { stateTone } from "./pay-logic";
import { Pill, TD, TH, Tbl } from "./pay-ui";

function Qr({ content, label }: { content: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let on = true; void QRCode.toDataURL(content, { margin: 1, width: 192 }).then((u) => { if (on) setSrc(u); }).catch(() => undefined); return () => { on = false; }; }, [content]);
  return src ? <img src={src} alt={label} width={192} height={192} className="rounded-lg border bg-white p-1" data-testid="pay-qr" /> : null;
}

/** Staff view of an invoice's payment status and its payment links (amount-locked to what is owed, expiring, one use). */
export function PayLinksPanel() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const money = (v: number, c: string) => formatMoneyAmount(v, c, locale);
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const found = useInvoiceSearch(submitted ?? "", submitted !== null);
  const status = useInvoiceStatus(invoiceId);
  const links = useLinks();
  const create = useCreateLink();
  const cancel = useCancelLink();
  const st = status.data;
  return (
    <div className="space-y-4" data-testid="pay-links">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pay.l.find")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(term.trim()); setInvoiceId(null); setCreated(null); }}>
            <label className="sr-only" htmlFor="pay-find">{t("pay.l.findHint")}</label>
            <Input id="pay-find" className="max-w-xs" placeholder={t("pay.l.findHint")} value={term} onChange={(e) => setTerm(e.target.value)} data-testid="pay-find" />
            <Button type="submit" className="min-h-11" data-testid="pay-find-go">{t("pay.l.search")}</Button>
          </form>
          {found.data && found.data.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="pay-find-none">{t("pay.l.none")}</p> : null}
          {found.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("pay.financeOnly")}</p> : null}
          <ul className="space-y-1">
            {(found.data ?? []).map((i) => (
              <li key={i.id}>
                <Button variant={invoiceId === i.id ? "default" : "outline"} className="min-h-11 w-full justify-between gap-2" onClick={() => { setInvoiceId(i.id); setCreated(null); }} data-testid={`pay-invoice-${i.invoiceNumber}`}>
                  <span className="ltr-nums">{i.invoiceNumber}</span><span className="truncate">{i.patientName}</span><span className="ltr-nums text-xs">{money(i.outstanding, i.currency)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {st ? (
        <Card data-testid="pay-invoice-status" data-state={st.invoice.state}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base"><span className="ltr-nums">{st.invoice.invoiceNumber}</span><Pill tone={stateTone(st.invoice.state)} testid="pay-invoice-state">{t(`pay.l.state.${st.invoice.state}`)}</Pill></CardTitle>
            <p className="text-sm text-muted-foreground">{st.invoice.patientName} · {t("pay.l.owes", { amount: money(st.invoice.outstanding, st.invoice.currency), total: money(st.invoice.total, st.invoice.currency) })}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <section aria-labelledby="pay-links-h" className="space-y-2">
              <h3 id="pay-links-h" className="text-sm font-medium">{t("pay.l.links")}</h3>
              {st.links.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.l.noLinks")}</p> : (
                <ul className="space-y-1" data-testid="pay-invoice-links">
                  {st.links.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm"><Pill tone={stateTone(l.state)}>{t(`pay.l.state.${l.state}`)}</Pill><span className="ltr-nums">{money(l.amount, l.currency)}</span><span className="text-xs text-muted-foreground">{t("pay.l.expires", { when: new Date(l.expiresAt).toLocaleString(locale) })}</span>
                      {l.state === "ACTIVE" ? <Button size="sm" variant="ghost" className="min-h-11" onClick={() => cancel.mutate(l.id)} data-testid="pay-link-cancel">{t("pay.l.cancel")}</Button> : null}</li>
                  ))}
                </ul>
              )}
              {st.invoice.outstanding > 0 ? <Button className="min-h-11" disabled={create.isPending} onClick={() => create.mutate({ invoiceId: st.invoice.id, clinicId: st.invoice.clinicId }, { onSuccess: setCreated })} data-testid="pay-link-create">{t("pay.l.create")}</Button> : null}
              {create.isError ? <p role="alert" className="text-sm text-destructive">{apiErrorMessage(create.error, t)}</p> : null}
              {created ? (
                <div className="space-y-2 rounded-lg border p-3" data-testid="pay-link-created">
                  <p className="text-sm">{t("pay.l.created")}</p>
                  <code className="block max-w-full break-all rounded bg-muted px-2 py-1 text-xs" dir="ltr" data-testid="pay-link-url">{created.url}</code>
                  <Button size="sm" variant="outline" className="min-h-11" onClick={() => void navigator.clipboard?.writeText(created.url)}>{t("pay.l.copy")}</Button>
                  <Qr content={created.qr.content} label={t("pay.l.qr")} />
                  <p className="text-xs text-muted-foreground">{t("pay.l.qr")}</p>
                </div>
              ) : null}
            </section>
            <section aria-labelledby="pay-bank-h" className="space-y-1">
              <h3 id="pay-bank-h" className="text-sm font-medium">{t("pay.l.bank")}</h3>
              {st.matches.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.l.none2")}</p> : <ul className="space-y-1 text-sm" data-testid="pay-invoice-matches">{st.matches.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-2"><Pill tone={stateTone(m.status)}>{t(`pay.l.state.${m.status}`)}</Pill><span className="ltr-nums">{m.bankRef}</span><span className="ltr-nums">{money(m.amount, m.currency)}</span></li>)}</ul>}
            </section>
            <section aria-labelledby="pay-pay-h" className="space-y-1">
              <h3 id="pay-pay-h" className="text-sm font-medium">{t("pay.l.payments")}</h3>
              {st.payments.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.l.none2")}</p> : <ul className="space-y-2 text-sm" data-testid="pay-invoice-payments">{st.payments.map((p) => <li key={p.id}><span className="ltr-nums">{money(p.total, p.currency)} · {new Date(p.at).toLocaleDateString(locale)} · {p.methods.join(", ")}</span> <RefundRequest paymentId={p.id} max={p.total} /></li>)}</ul>}
            </section>
            <section aria-labelledby="pay-ref-h" className="space-y-1">
              <h3 id="pay-ref-h" className="text-sm font-medium">{t("pay.l.refunds")}</h3>
              {st.refunds.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.l.none2")}</p> : <ul className="space-y-1 text-sm">{st.refunds.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><Pill tone={stateTone(r.status)}>{t(`pay.r.status.${r.status}`, { defaultValue: r.status })}</Pill><span className="ltr-nums">{money(r.amount, st.invoice.currency)}</span></li>)}</ul>}
            </section>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("pay.l.allLinks")}</CardTitle></CardHeader>
        <CardContent>
          {links.data && links.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("pay.l.noLinks")}</p> : null}
          {links.data && links.data.items.length > 0 ? (
            <Tbl label={t("pay.l.allLinks")} testid="pay-all-links">
              <thead><tr><TH>{t("pay.m.colReference")}</TH><TH>{t("pay.m.colAmount")}</TH><TH>{t("pay.r.colStatus")}</TH><TH>{t("pay.r.colDate")}</TH></tr></thead>
              <tbody>{links.data.items.map((l) => <tr key={l.id}><TD className="ltr-nums">{l.invoice?.invoiceNumber ?? l.context}</TD><TD className="ltr-nums">{money(l.amount, l.currency)}</TD><TD><Pill tone={stateTone(l.state)}>{t(`pay.l.state.${l.state}`)}</Pill></TD><TD className="ltr-nums">{new Date(l.expiresAt).toLocaleDateString(locale)}</TD></tr>)}</tbody>
            </Tbl>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** A refund request for one payment from the invoice status card. The amount cannot exceed the payment; approval limits are the server's. */
function RefundRequest({ paymentId, max }: { paymentId: string; max: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(max));
  const [reason, setReason] = useState("");
  const req = useRequestRefund();
  if (!open) return <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setOpen(true)} data-testid="pay-refund-open">{t("pay.r.request")}</Button>;
  return (
    <form className="mt-2 grid max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); req.mutate({ paymentId, amount: Number(amount), reason: reason.trim() }, { onSuccess: () => setOpen(false) }); }} data-testid="pay-refund-inline">
      <label className="grid gap-1"><span>{t("pay.r.amount")}</span><Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="pay-inline-amount" /></label>
      <label className="grid gap-1"><span>{t("pay.r.reason")}</span><Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="pay-inline-reason" /></label>
      <Button type="submit" className="min-h-11" disabled={req.isPending || !(Number(amount) > 0) || Number(amount) > max || !reason.trim()} data-testid="pay-inline-submit">{t("pay.r.submit")}</Button>
      {req.isError ? <p role="alert" className="text-destructive">{apiErrorMessage(req.error, t)}</p> : null}
    </form>
  );
}
