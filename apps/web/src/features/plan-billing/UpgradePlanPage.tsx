import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, CreditCard, Minus, RefreshCw, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/brand/ui-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/http";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { useAuthStore } from "@/stores/auth-store";
import { postLegalAccept } from "@/lib/legal-api";
import { useInvoiceHistory, useInvalidatePlanBilling, usePaymentMethods, usePlanCompare, usePlanRenewal, useSetAutoRenew } from "./plan-billing-api";
import {
  LIMIT_KEYS, daysUntil, isFreePlanKey, isOn, limitOf, priceFor, upgradeTargets, usagePercent, visibleFeatureGroups,
  type ComparePlan, type DowngradeImpact, type PlanCompare, type RenewalState,
} from "./plan-billing-logic";

type Interval = "MONTHLY" | "ANNUAL";

/** Named, keyboard-focusable scroll region: on a 320 px screen the comparison table scrolls sideways (WCAG 2.1.1). */
function ScrollRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border">{children}</div>;
}

function usePlanText() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const ar = i18n.language.startsWith("ar");
  const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const planName = (p: { nameEn: string; nameAr: string }) => (ar ? p.nameAr || p.nameEn : p.nameEn);
  const money = (amount: string | number, currency: string) => formatMoneyAmount(Number(amount), currency, locale);
  return { t, locale, ar, date, num, planName, money };
}

function ImpactSummary({ impact, testid }: { impact: DowngradeImpact; testid: string }) {
  const { t, num } = usePlanText();
  const over = impact.reducedLimits.reduce((n, l) => n + l.overBy, 0);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm" data-testid={testid}>
      <h4 className="font-medium">{t("planBilling.offWhatChanges")}</h4>
      {impact.lostFeatures.length === 0 && impact.reducedLimits.length === 0 ? <p>{t("planBilling.nothingLost")}</p> : null}
      {impact.lostFeatures.length > 0 ? (
        <div>
          <p className="text-muted-foreground">{t("planBilling.offLostFeatures")}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5" data-testid={`${testid}-lost`}>
            {impact.lostFeatures.map((k) => <li key={k}>{t(`planBilling.features.${k}`, { defaultValue: k })}</li>)}
          </ul>
        </div>
      ) : null}
      {impact.reducedLimits.length > 0 ? (
        <div>
          <p className="text-muted-foreground">{t("planBilling.offLimits")}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {impact.reducedLimits.map((l) => (
              <li key={l.key}>{t("planBilling.offLimitRow", { label: t(`planBilling.limitLabels.${l.key}`), from: l.from == null ? t("planBilling.unlimited") : num(l.from), to: l.to == null ? t("planBilling.unlimited") : num(l.to), current: l.current == null ? "-" : num(l.current) })}</li>
            ))}
          </ul>
          {over > 0 ? <p className="mt-1 text-[hsl(var(--warning))]">{t("planBilling.offOver", { count: over })}</p> : null}
        </div>
      ) : null}
      <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t("planBilling.offKept", { days: impact.readOnlyGraceDays })}</p>
    </div>
  );
}

function AutoRenewControl({ state, canManage }: { state: RenewalState; canManage: boolean }) {
  const { t, date } = usePlanText();
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const mut = useSetAutoRenew();
  if (state.onFreePlan) return null;
  const forced = state.autoRenewForced;
  const disabled = !canManage || !state.canChangeAutoRenew;
  const endsOn = date(state.endsOn ?? state.currentPeriodEnd);
  const turnOn = () => mut.mutate({ enabled: true }, { onSuccess: () => toast.success(t("planBilling.onDone")), onError: (e: Error) => toast.error(e.message) });
  const turnOff = () =>
    mut.mutate({ enabled: false, confirmDowngrade: true }, {
      onSuccess: () => { setOpen(false); setUnderstood(false); toast.success(t("planBilling.offDone")); },
      onError: (e: Error) => toast.error(e.message),
    });
  return (
    <section aria-labelledby="ar-h" className="rounded-xl border p-3" data-testid="auto-renew">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ar-h" className="flex items-center gap-2 text-sm font-medium"><RefreshCw className="size-4" aria-hidden />{t("planBilling.autoRenew")}</h3>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="auto-renew-state">
            {state.autoRenew ? t("planBilling.autoRenewOn") : t("planBilling.autoRenewOff", { date: endsOn })}
          </p>
          {forced ? <p className="mt-1 text-xs text-muted-foreground" data-testid="auto-renew-forced">{forced === "ON" ? t("planBilling.autoRenewForcedOn") : t("planBilling.autoRenewForcedOff")}</p> : null}
          {!canManage ? <p className="mt-1 text-xs text-muted-foreground">{t("planBilling.ownerOnly")}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.autoRenew}
          aria-label={t("planBilling.autoRenew")}
          disabled={disabled || mut.isPending}
          data-testid="auto-renew-switch"
          onClick={() => (state.autoRenew ? setOpen(true) : turnOn())}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${state.autoRenew ? "bg-primary" : "bg-muted"}`}
        >
          <span aria-hidden className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${state.autoRenew ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"}`} />
        </button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setUnderstood(false); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="auto-renew-dialog">
          <DialogHeader>
            <DialogTitle>{t("planBilling.offTitle")}</DialogTitle>
            <DialogDescription>{t("planBilling.offLead", { date: endsOn })}</DialogDescription>
          </DialogHeader>
          {state.downgradeImpact ? <ImpactSummary impact={state.downgradeImpact} testid="auto-renew-impact" /> : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="auto-renew-understood" />
            <span>{t("planBilling.offConfirmCheck", { date: endsOn })}</span>
          </label>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("planBilling.keep")}</Button>
            <Button type="button" variant="destructive" disabled={!understood || mut.isPending} onClick={turnOff} data-testid="auto-renew-confirm">{t("planBilling.offConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CurrentPlanCard({ state, compare, canManage }: { state: RenewalState; compare: PlanCompare; canManage: boolean }) {
  const { t, date, num, planName } = usePlanText();
  const cur = compare.plans.find((p) => p.key === compare.currentPlanKey);
  const graceDays = daysUntil(state.liteReadOnlyGraceUntil);
  return (
    <Card data-testid="current-plan">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {t("planBilling.current")}: <span data-testid="current-plan-name">{planName(state.plan)}</span>
          <Badge variant={state.status === "ACTIVE" ? "default" : "muted"}>{t(`planBilling.status.${state.status}`, { defaultValue: state.status })}</Badge>
        </CardTitle>
        <CardDescription data-testid="current-plan-renewal">
          {state.onFreePlan ? t("planBilling.freeNow") : state.autoRenew ? t("planBilling.renewsOn", { date: date(state.renewsOn) }) : t("planBilling.endsOn", { date: date(state.endsOn) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.liteReadOnlyGraceUntil ? (
          <div role="status" className="rounded-lg border border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)] p-3 text-sm" data-testid="lite-grace">
            <p className="font-medium">{t("planBilling.graceTitle")}</p>
            <p>{t("planBilling.graceBody", { date: date(state.liteReadOnlyGraceUntil) })}{graceDays != null ? ` (${num(graceDays)})` : ""}</p>
          </div>
        ) : null}
        <section aria-labelledby="usage-h" data-testid="usage">
          <h3 id="usage-h" className="mb-2 text-sm font-medium">{t("planBilling.usage")}</h3>
          <ul className="grid gap-3 sm:grid-cols-3">
            {LIMIT_KEYS.filter((k) => cur && k in cur.entitlements).map((k) => {
              const limit = limitOf(cur!.entitlements[k]);
              const current = compare.usage[k];
              const pct = usagePercent(current, limit);
              return (
                <li key={k} className="rounded-lg border p-3 text-sm" data-testid={`usage-${k}`}>
                  <div className="flex items-baseline justify-between gap-2"><span className="text-muted-foreground">{t(`planBilling.limitLabels.${k}`)}</span><span className="ltr-nums font-medium">{limit == null ? t("planBilling.unlimited") : t("planBilling.usageRow", { current: num(current ?? 0), limit: num(limit) })}</span></div>
                  {pct != null ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation"><div className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-[hsl(var(--warning))]" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div> : null}
                </li>
              );
            })}
          </ul>
        </section>
        <AutoRenewControl state={state} canManage={canManage} />
        <p className="text-xs text-muted-foreground">{t("planBilling.reminders", { days: state.policy.renewalReminderDaysBefore.join(", ") })} {t("planBilling.lapse", { days: state.policy.downgradeAfterDays })}</p>
      </CardContent>
    </Card>
  );
}

function PaymentMethodCard({ state }: { state: RenewalState }) {
  const { t } = usePlanText();
  const methods = usePaymentMethods();
  const card = state.paymentMethod;
  async function addCard() {
    try {
      const session = await apiPost<{ iframeUrl: string }>("/api/v1/billing/payment-methods/card-session", { returnUrl: window.location.href });
      window.open(session.iframeUrl, "_blank", "noopener,noreferrer");
      toast.message(t("planBilling.cardSession"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const list = methods.data ?? [];
  return (
    <Card data-testid="payment-method">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="size-4" aria-hidden />{t("planBilling.paymentMethod")}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {card ? (
          <p data-testid="payment-method-default">{t("planBilling.card", { brand: card.brand ?? "Card", last4: card.last4 ?? "----" })}{card.expMonth && card.expYear ? <span className="text-muted-foreground"> ({t("planBilling.cardExp", { m: String(card.expMonth).padStart(2, "0"), y: card.expYear })})</span> : null}</p>
        ) : <p className="text-muted-foreground" data-testid="payment-method-none">{t("planBilling.noCard")}</p>}
        {list.length > 1 ? <p className="text-xs text-muted-foreground">{list.length}</p> : null}
        <Button type="button" size="sm" variant="outline" onClick={() => void addCard()} data-testid="add-card">{t("planBilling.addCard")}</Button>
      </CardContent>
    </Card>
  );
}

function InvoiceHistory() {
  const { t, date, money } = usePlanText();
  const q = useInvoiceHistory();
  const rows = q.data?.items ?? [];
  return (
    <Card data-testid="invoice-history">
      <CardHeader><CardTitle className="text-base">{t("planBilling.invoices")}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("planBilling.noInvoices")}</p> : (
          <ScrollRegion label={t("planBilling.invoices")}>
            <table className="w-full min-w-[28rem] text-sm">
              <thead><tr>{["colNumber", "colPeriod", "colTotal", "colStatus"].map((c) => <th key={c} scope="col" className="h-10 px-3 text-start font-medium text-muted-foreground">{t(`planBilling.${c}`)}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border-t p-3 ltr-nums">{r.number}</td>
                    <td className="border-t p-3 ltr-nums">{r.periodKey}</td>
                    <td className="border-t p-3 ltr-nums">{money(r.total, r.currency)}</td>
                    <td className="border-t p-3">{t(`planBilling.invoiceStatus.${r.status}`, { defaultValue: r.status })}{r.issuedAt ? <span className="sr-only"> {date(r.issuedAt)}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </CardContent>
    </Card>
  );
}

function PriceCell({ plan, interval }: { plan: ComparePlan; interval: Interval }) {
  const { t, money, num } = usePlanText();
  if (isFreePlanKey(plan.key)) return <span className="text-lg font-semibold" data-testid={`price-${plan.key}`}>{t("planBilling.free")}</span>;
  const p = priceFor(plan, interval);
  // No active price in this market: a visible placeholder, never a guessed number (NEEDS_HUMAN).
  if (!p) return <span className="text-sm text-muted-foreground" data-testid={`price-${plan.key}`}>{t("planBilling.priceTbd")}</span>;
  return (
    <span data-testid={`price-${plan.key}`}>
      <span className="text-lg font-semibold ltr-nums">{money(p.amount, p.currency)}</span>
      <span className="block text-xs text-muted-foreground">{interval === "MONTHLY" ? t("planBilling.perMonth") : t("planBilling.perYear")}{p.unit === "PER_CLINICIAN" ? ` · ${t("planBilling.perClinician")}` : ""}</span>
      {p.extraClinicianAmount ? <span className="block text-xs text-muted-foreground">{t("planBilling.extraClinician", { amount: money(p.extraClinicianAmount, p.currency), count: num(p.includedClinicians) })}</span> : null}
    </span>
  );
}

function UpgradeDialog({ plan, interval, state, compare, onClose }: { plan: ComparePlan | null; interval: Interval; state: RenewalState; compare: PlanCompare; onClose: () => void }) {
  const { t, planName, money } = usePlanText();
  const done = useInvalidatePlanBilling();
  const sub = useQuery({ queryKey: ["billing", "subscription"], queryFn: () => apiGet<{ clinicianSeats: number }>("/api/v1/billing/subscription"), retry: false });
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState<{ document: string; version: string }[] | null>(null);
  if (!plan) return null;
  const price = priceFor(plan, interval);
  const submit = async () => {
    setBusy(true);
    try {
      if (state.onFreePlan) {
        const r = await apiPost<{ needsPaymentMethod: boolean }>("/api/v1/billing/subscription/reactivate", { planKey: plan.key, interval });
        toast.success(t("planBilling.upgraded") + (r.needsPaymentMethod ? " " + t("planBilling.needsCard") : ""));
      } else {
        await apiPost("/api/v1/billing/subscription/change-plan", { planKey: plan.key, interval, seats: sub.data?.clinicianSeats ?? 1, confirm: true });
        toast.success(t("planBilling.upgraded"));
      }
      done();
      onClose();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { errorCode?: string; required?: { document: string; version: string }[] } | undefined) : undefined;
      if (body?.errorCode === "LEGAL_ACCEPTANCE_REQUIRED" && body.required) setLegal(body.required);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (!legal) return;
    setBusy(true);
    try {
      await postLegalAccept(legal);
      setLegal(null);
      setBusy(false);
      await submit();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  void compare;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" data-testid="upgrade-dialog">
        <DialogHeader>
          <DialogTitle>{t("planBilling.confirmUpgradeTitle", { plan: planName(plan) })}</DialogTitle>
          <DialogDescription>{t("planBilling.confirmUpgradeBody")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{price ? t("planBilling.confirmUpgradePrice", { price: money(price.amount, price.currency) }) : t("planBilling.priceTbd")}</p>
        {legal ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="legal-gate">
            <p className="font-medium">{t("planBilling.legalTitle")}</p>
            <p>{t("planBilling.legalBody")}</p>
            <ul className="list-disc ps-5">{legal.map((d) => <li key={d.document}><a className="underline" href={`/api/v1/public/legal/${d.document}`} target="_blank" rel="noreferrer">{d.document.replace(/_/g, " ")}</a></li>)}</ul>
            <Button type="button" size="sm" onClick={() => void accept()} disabled={busy}>{t("planBilling.legalAccept")}</Button>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t("planBilling.cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !!legal || !price} data-testid="upgrade-confirm">{t("planBilling.confirmUpgrade")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonTable({ compare, state, canManage, interval, setInterval, onUpgrade }: { compare: PlanCompare; state: RenewalState; canManage: boolean; interval: Interval; setInterval: (i: Interval) => void; onUpgrade: (p: ComparePlan) => void }) {
  const { t, planName, num } = usePlanText();
  const groups = useMemo(() => visibleFeatureGroups(compare.plans, compare.edition), [compare]);
  const plans = compare.plans;
  const targets = upgradeTargets(plans).map((p) => p.key);
  return (
    <Card data-testid="plan-compare">
      <CardHeader>
        <CardTitle className="text-base">{t("planBilling.compare")}</CardTitle>
        <CardDescription>{t("planBilling.compareHint")}</CardDescription>
        <div role="group" aria-label={t("planBilling.intervalLabel")} className="mt-2 inline-flex w-fit rounded-lg border p-0.5" data-testid="interval-toggle">
          {(["MONTHLY", "ANNUAL"] as const).map((i) => (
            <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)} className={`rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${interval === i ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
              {t(i === "MONTHLY" ? "planBilling.monthly" : "planBilling.annual")}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollRegion label={t("planBilling.compare")}>
          <table className="w-full min-w-[40rem] text-sm" data-testid="plan-table">
            <caption className="sr-only">{t("planBilling.compare")}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 z-10 w-44 bg-card p-3 text-start font-medium text-muted-foreground">{t("planBilling.featureCol")}</th>
                {plans.map((p) => (
                  <th key={p.key} scope="col" className={`p-3 text-start align-top ${p.relation === "CURRENT" ? "bg-primary/5" : ""}`} data-testid={`plan-col-${p.key}`}>
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold">{planName(p)}{p.relation === "CURRENT" ? <Badge variant="default">{t("planBilling.planNow")}</Badge> : null}</span>
                    <span className="mt-1 block font-normal"><PriceCell plan={p} interval={interval} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="rowgroup" colSpan={plans.length + 1} className="bg-muted/50 px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("planBilling.limits")}</th></tr>
              {LIMIT_KEYS.filter((k) => plans.some((p) => k in p.entitlements)).map((k) => (
                <tr key={k}>
                  <th scope="row" className="sticky start-0 z-10 bg-card p-3 text-start font-normal">{t(`planBilling.limitLabels.${k}`)}</th>
                  {plans.map((p) => { const v = limitOf(p.entitlements[k]); return <td key={p.key} className={`border-t p-3 ltr-nums ${p.relation === "CURRENT" ? "bg-primary/5" : ""}`}>{k in p.entitlements ? (v == null ? t("planBilling.unlimited") : num(v)) : "-"}</td>; })}
                </tr>
              ))}
              {groups.map((g) => (
                <GroupRows key={g.id} id={g.id} keys={g.keys} plans={plans} />
              ))}
              <tr>
                <th scope="row" className="sticky start-0 z-10 bg-card p-3 text-start font-normal"><span className="sr-only">{t("planBilling.upgrade")}</span></th>
                {plans.map((p) => (
                  <td key={p.key} className={`border-t p-3 align-top ${p.relation === "CURRENT" ? "bg-primary/5" : ""}`}>
                    {p.relation === "UPGRADE" && targets.includes(p.key) ? (
                      <Button type="button" size="sm" disabled={!canManage || !priceFor(p, interval)} onClick={() => onUpgrade(p)} data-testid={`upgrade-${p.key}`}>
                        {state.onFreePlan && state.previousPlan?.key === p.key ? t("planBilling.reactivate", { plan: planName(p) }) : t("planBilling.upgrade")}
                      </Button>
                    ) : p.relation === "DOWNGRADE" ? <span className="text-xs text-muted-foreground">{t("planBilling.downgradeNote")}</span> : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
        {plans.filter((p) => p.relation === "DOWNGRADE" && p.downgradeImpact).map((p) => (
          <details key={p.key} className="rounded-lg border p-3" data-testid={`downgrade-${p.key}`}>
            <summary className="cursor-pointer text-sm font-medium">{t("planBilling.whatYouLose")}: {planName(p)}</summary>
            <div className="mt-3"><ImpactSummary impact={p.downgradeImpact!} testid={`impact-${p.key}`} /></div>
          </details>
        ))}
        <p className="text-xs text-muted-foreground" data-testid="proration-note">
          {t("planBilling.proration")}: {t("planBilling.prorationUpgrade", { timing: t(`planBilling.timing.${compare.policy.proration.upgradeTiming}`) })} {t("planBilling.prorationDowngrade", { timing: t(`planBilling.timing.${compare.policy.proration.downgradeTiming}`) })}
          {compare.taxLine ? ` ${t("planBilling.tax", { rate: compare.taxLine.ratePercent })}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function GroupRows({ id, keys, plans }: { id: string; keys: string[]; plans: ComparePlan[] }) {
  const { t } = usePlanText();
  return (
    <>
      <tr><th scope="rowgroup" colSpan={plans.length + 1} className="bg-muted/50 px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`planBilling.groups.${id}`)}</th></tr>
      {keys.map((k) => (
        <tr key={k}>
          <th scope="row" className="sticky start-0 z-10 bg-card p-3 text-start font-normal">{t(`planBilling.features.${k}`, { defaultValue: k })}</th>
          {plans.map((p) => {
            const on = isOn(p.entitlements[k]);
            return (
              <td key={p.key} className={`border-t p-3 ${p.relation === "CURRENT" ? "bg-primary/5" : ""}`} data-testid={`cell-${k}-${p.key}`} data-on={on ? "1" : "0"}>
                {on ? <Check className="size-4 text-primary" aria-hidden /> : <Minus className="size-4 text-muted-foreground" aria-hidden />}
                <span className="sr-only">{on ? t("planBilling.included") : t("planBilling.notIncluded")}</span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** SUB-01 Upgrade plan: current plan, usage, renewal and auto-renew, plan comparison, payment method, invoices. */
export function UpgradePlanPage() {
  const { t } = usePlanText();
  const renewal = usePlanRenewal();
  const compare = usePlanCompare();
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user && (user.isTenantOwner || user.role === "group_admin" || user.role === "clinic_admin"));
  const [interval, setInterval] = useState<Interval>("MONTHLY");
  const [target, setTarget] = useState<ComparePlan | null>(null);
  if (renewal.isPending || compare.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("planBilling.loading")}</p>;
  if (renewal.isError || compare.isError || !renewal.data || !compare.data) {
    return <EmptyState tone="error" compact title={t("planBilling.loadError")} action={<Button size="sm" variant="outline" onClick={() => { void renewal.refetch(); void compare.refetch(); }}>{t("planBilling.retry")}</Button>} />;
  }
  return (
    <div className="space-y-4" data-testid="upgrade-plan">
      <div>
        <h1 className="text-xl font-semibold">{t("planBilling.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("planBilling.intro")}</p>
        <a href="#plan-compare-anchor" className="sr-only focus:not-sr-only focus:underline">{t("planBilling.skipToTable")}</a>
      </div>
      <CurrentPlanCard state={renewal.data} compare={compare.data} canManage={canManage} />
      <div id="plan-compare-anchor" />
      <ComparisonTable compare={compare.data} state={renewal.data} canManage={canManage} interval={interval} setInterval={setInterval} onUpgrade={setTarget} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentMethodCard state={renewal.data} />
        <InvoiceHistory />
      </div>
      {target ? <UpgradeDialog plan={target} interval={interval} state={renewal.data} compare={compare.data} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

export default UpgradePlanPage;
