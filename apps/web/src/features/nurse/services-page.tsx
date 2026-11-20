import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch, apiPut } from "@/lib/http";
import { EmptyBlock, ErrorBlock, Field, LoadingBlock, money, PageShell, StatusPill, useErrorText, useHomeServices, useServiceName, type AppointmentTypeRow } from "./nurse-shared";

type Plan = { key: string; nameEn: string; nameAr: string; audienceEn: string; priceStatus: "PROPOSED"; priceMonthlyEgp: number | null; priceAnnualEquivalentEgp: number | null; unit: string; includedNurses: number | null; extraNurseMonthlyEgp: number | null; minimumInvoiceEgp: number | null; includesEn: string };
type PlansResponse = { priceStatus: "PROPOSED"; note: string; plans: Plan[] };

/** KNSVC01/02 — the 8-service catalogue (HOME visit types, 30/30 travel buffers) with editable prices, and the plan prices (always flagged PROPOSED / not final). */
export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const services = useHomeServices();
  const name = useServiceName();
  const plans = useQuery({ queryKey: ["nurse", "plans"], queryFn: () => apiGet<PlansResponse>("/api/v1/public/nurse/plans"), staleTime: 10 * 60_000 });
  const ar = i18n.language.startsWith("ar");
  return (
    <PageShell title={t("nurse.services.title")} subtitle={t("nurse.services.subtitle")} testId="nurse-services">
      <p className="rounded-md border border-[hsl(var(--warning)/0.6)] bg-amber-500/10 p-3 text-sm" data-testid="services-proposed-note">{t("nurse.services.proposedNote")}</p>
      {services.isLoading ? <LoadingBlock /> : null}
      {services.isError ? <ErrorBlock error={services.error} onRetry={() => void services.refetch()} /> : null}
      {services.data && services.data.length === 0 ? <EmptyBlock message={t("nurse.services.empty")} /> : null}
      <ul className="space-y-3">
        {services.data?.map((s) => <ServiceRow key={s.id} s={s} label={name(s)} />)}
      </ul>

      <h2 className="pt-2 text-lg font-semibold">{t("nurse.services.plansTitle")}</h2>
      <p className="text-sm text-muted-foreground">{plans.data?.note ?? t("nurse.services.plansNote")}</p>
      {plans.isLoading ? <LoadingBlock /> : null}
      {plans.isError ? <ErrorBlock error={plans.error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="nurse-plans">
        {plans.data?.plans.map((p) => (
          <Card key={p.key} data-testid="nurse-plan-card" data-plan={p.key}>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{ar ? p.nameAr : p.nameEn}</span>
                <StatusPill tone="warn">{t("nurse.services.proposed")}</StatusPill>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-muted-foreground">{p.audienceEn}</p>
              <p className="font-medium">{p.priceMonthlyEgp == null ? t("nurse.services.custom") : t("nurse.services.perMonth", { price: money(p.priceMonthlyEgp) })}</p>
              <p className="text-muted-foreground">{p.unit}</p>
              {p.priceAnnualEquivalentEgp ? <p className="text-muted-foreground">{t("nurse.services.annual", { price: money(p.priceAnnualEquivalentEgp) })}</p> : null}
              <p>{p.includesEn}</p>
              <p className="text-xs text-muted-foreground">{t("nurse.services.safetyAll")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

function ServiceRow({ s, label }: { s: AppointmentTypeRow; label: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const [fee, setFee] = useState(String(Number(s.feeAmount)));
  const [surcharge, setSurcharge] = useState(String(Number(s.homeSurchargeAmount ?? 0)));
  const dirty = Number(fee) !== Number(s.feeAmount) || Number(surcharge) !== Number(s.homeSurchargeAmount ?? 0);
  const save = useMutation({
    mutationFn: async () => {
      if (Number(fee) !== Number(s.feeAmount)) await apiPatch(`/api/v1/scheduling/appointment-types/${s.id}`, { feeAmount: Number(fee) });
      if (Number(surcharge) !== Number(s.homeSurchargeAmount ?? 0)) await apiPut(`/api/v1/home-visits/appointment-types/${s.id}`, { serviceLocation: "HOME", homeSurchargeAmount: Number(surcharge) });
    },
    onSuccess: () => { toast.success(t("nurse.services.saved")); void qc.invalidateQueries({ queryKey: ["nurse", "services"] }); },
    onError: (e) => toast.error(errText(e)),
  });
  const valid = Number(fee) >= 0 && Number(surcharge) >= 0 && fee !== "" && surcharge !== "";
  return (
    <li>
      <Card data-testid="service-row">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{t("nurse.services.meta", { minutes: s.durationMinutes, before: s.bufferBeforeMin ?? 0, after: s.bufferAfterMin ?? 0 })}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("nurse.services.price")} htmlFor={`fee-${s.id}`}><Input id={`fee-${s.id}`} type="number" min={0} className="min-h-11" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
            <Field label={t("nurse.services.surcharge")} htmlFor={`sur-${s.id}`}><Input id={`sur-${s.id}`} type="number" min={0} className="min-h-11" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("nurse.services.total", { total: money(Number(fee) + Number(surcharge)) })}</p>
            <Button size="sm" className="min-h-11" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>{t("nurse.common.save")}</Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
