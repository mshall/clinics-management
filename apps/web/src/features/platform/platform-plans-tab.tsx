import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch, apiPost } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { PlatformPriceMigrationsCard, PriceImpactPanel, type PriceImpactPreview } from "./platform-price-impact";

type PlanRow = {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  isPublic: boolean;
  sortOrder: number;
  entitlements: Array<{ key: string; value: unknown }>;
  prices: Array<{
    id: string;
    marketId: string;
    currency: string;
    interval: string;
    unit: string;
    amount: string;
    includedClinicians: number;
    extraClinicianAmount: string | null;
    priceVersion: number;
    validFrom: string;
    validTo: string | null;
    cohortKey: string | null;
  }>;
};

type MarketRow = { id: string; code: string; defaultCurrency: string };

export function PlatformPlansTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState({
    marketId: "",
    amount: "",
    interval: "MONTHLY",
    unit: "PER_TENANT",
    includedClinicians: "1",
    extraClinicianAmount: "",
    newVersion: true,
  });
  const [impact, setImpact] = useState<PriceImpactPreview | null>(null);

  const plansQuery = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiGet<PlanRow[]>("/api/v1/admin/platform/plans"),
  });

  const marketsQuery = useQuery({
    queryKey: ["platform", "markets", "operable"],
    queryFn: () => apiGet<MarketRow[]>("/api/v1/admin/platform/markets/operable"),
  });

  const marketsById = useMemo(() => {
    const map = new Map<string, MarketRow>();
    for (const m of marketsQuery.data ?? []) map.set(m.id, m);
    return map;
  }, [marketsQuery.data]);

  const patchMut = useMutation({
    mutationFn: (payload: { planId: string; isPublic: boolean }) =>
      apiPatch(`/api/v1/admin/platform/plans/${encodeURIComponent(payload.planId)}`, {
        isPublic: payload.isPublic,
      }),
    onSuccess: () => {
      toast.success(t("platform.plans.saved", "Plan updated"));
      void qc.invalidateQueries({ queryKey: ["platform", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priceMut = useMutation({
    mutationFn: (payload: { planId: string; body: Record<string, unknown> }) =>
      apiPost(`/api/v1/admin/platform/plans/${encodeURIComponent(payload.planId)}/prices`, payload.body),
    onSuccess: () => {
      toast.success(t("platform.plans.priceSaved", "Price version saved"));
      void qc.invalidateQueries({ queryKey: ["platform", "plans", "price-migrations"] });
      setPriceDraft((d) => ({ ...d, amount: "", extraClinicianAmount: "" }));
      setImpact(null);
      void qc.invalidateQueries({ queryKey: ["platform", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMut = useMutation({
    mutationFn: (payload: { planId: string; body: Record<string, unknown> }) =>
      apiPost<{ impact: PriceImpactPreview }>(
        `/api/v1/admin/platform/plans/${encodeURIComponent(payload.planId)}/prices`,
        { ...payload.body, preview: true },
      ),
    onSuccess: (data) => setImpact(data.impact),
    onError: (e: Error) => toast.error(e.message),
  });

  const plans = plansQuery.data ?? [];

  const draftBody = (): Record<string, unknown> | null => {
    if (!selectedPlanId || !priceDraft.marketId || !priceDraft.amount.trim()) return null;
    const market = marketsById.get(priceDraft.marketId);
    if (!market) return null;
    return {
      marketId: priceDraft.marketId,
      currency: market.defaultCurrency,
      interval: priceDraft.interval,
      unit: priceDraft.unit,
      amount: Number(priceDraft.amount),
      includedClinicians: Number(priceDraft.includedClinicians || 1),
      extraClinicianAmount: priceDraft.extraClinicianAmount.trim() ? Number(priceDraft.extraClinicianAmount) : null,
      newVersion: priceDraft.newVersion,
    };
  };

  const submitPrice = () => {
    const body = draftBody();
    if (!selectedPlanId || !body) return;
    priceMut.mutate({ planId: selectedPlanId, body });
  };

  const previewPrice = () => {
    const body = draftBody();
    if (!selectedPlanId || !body) return;
    previewMut.mutate({ planId: selectedPlanId, body });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.plans.title", "Plans & pricing")}</CardTitle>
          <CardDescription>
            {t(
              "platform.plans.hint",
              "Versioned catalog per market. New price versions grandfather existing subscriptions.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plansQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-4 text-sm">
              {plans.map((plan) => (
                <li key={plan.id} className="rounded-md border border-border px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {plan.nameEn} / {plan.nameAr}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{plan.key}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patchMut.mutate({ planId: plan.id, isPublic: !plan.isPublic })
                        }
                      >
                        {plan.isPublic
                          ? t("platform.plans.public", "Public")
                          : t("platform.plans.hidden", "Hidden")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedPlanId === plan.id ? "default" : "outline"}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setImpact(null);
                        }}
                      >
                        {t("platform.plans.addPrice", "Add price")}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("platform.plans.entitlements", "Entitlements")}:{" "}
                    {plan.entitlements.map((e) => e.key).join(", ")}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {plan.prices.slice(0, 8).map((p) => {
                      const market = marketsById.get(p.marketId);
                      return (
                        <li key={p.id} className="text-muted-foreground">
                          {market?.code ?? p.marketId} · v{p.priceVersion} · {p.interval} · {p.unit} · {p.amount}{" "}
                          {p.currency}
                          {p.validTo ? ` · until ${p.validTo.slice(0, 10)}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedPlanId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.plans.newPriceVersion", "New price version")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("platform.markets.title", "Market")}</Label>
              <select
                className={nativeSelectClassName}
                value={priceDraft.marketId}
                onChange={(e) => setPriceDraft((d) => ({ ...d, marketId: e.target.value }))}
              >
                <option value="">{t("common.select", "Select…")}</option>
                {(marketsQuery.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} ({m.defaultCurrency})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("platform.plans.amount", "Amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceDraft.amount}
                onChange={(e) => setPriceDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("platform.plans.interval", "Interval")}</Label>
              <select
                className={nativeSelectClassName}
                value={priceDraft.interval}
                onChange={(e) => setPriceDraft((d) => ({ ...d, interval: e.target.value }))}
              >
                <option value="MONTHLY">{t("platform.plans.monthly", "Monthly")}</option>
                <option value="ANNUAL">{t("platform.plans.annual", "Annual")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("platform.plans.unit", "Unit")}</Label>
              <select
                className={nativeSelectClassName}
                value={priceDraft.unit}
                onChange={(e) => setPriceDraft((d) => ({ ...d, unit: e.target.value }))}
              >
                <option value="PER_TENANT">{t("platform.plans.perTenant", "Per organization")}</option>
                <option value="PER_CLINICIAN">{t("platform.plans.perClinician", "Per clinician")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("platform.plans.includedClinicians", "Included clinicians")}</Label>
              <Input
                type="number"
                min={1}
                value={priceDraft.includedClinicians}
                onChange={(e) => setPriceDraft((d) => ({ ...d, includedClinicians: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("platform.plans.extraClinician", "Extra clinician amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceDraft.extraClinicianAmount}
                onChange={(e) => setPriceDraft((d) => ({ ...d, extraClinicianAmount: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" variant="outline" disabled={previewMut.isPending} onClick={previewPrice}>
                {t("platform.plans.previewImpact")}
              </Button>
              <Button type="button" disabled={priceMut.isPending} onClick={submitPrice}>
                {t("platform.plans.publishPrice", "Publish price version")}
              </Button>
            </div>
            {impact ? (
              <div className="sm:col-span-2">
                <PriceImpactPanel impact={impact} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <PlatformPriceMigrationsCard />
    </div>
  );
}