import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch, apiPost } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";

type KiorexRateRow = {
  id: string;
  marketId: string;
  marketCode: string;
  specialty: string | null;
  feeType: string;
  amount: string | null;
  percent: string | null;
  benchmarkFlat: string | null;
  benchmarkPercent: string | null;
  benchmarkSource: string | null;
  effectiveFeeExample: number | null;
  aboveBenchmarkTarget: boolean;
  benchmarkTargetRatio: number;
  currency: string;
  validFrom: string;
  validTo: string | null;
};

type MarketRow = { id: string; code: string; defaultCurrency: string };

const SPECIALTIES = [
  "",
  "GENERAL_MEDICINE",
  "DENTISTRY",
  "DERMATOLOGY",
  "PEDIATRICS",
  "POLYCLINIC",
] as const;

export function PlatformKiorexRatesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [marketFilter, setMarketFilter] = useState("");
  const [draft, setDraft] = useState({
    marketId: "",
    specialty: "",
    feeType: "FLAT",
    amount: "",
    percent: "",
    minAmount: "",
    maxAmount: "",
    benchmarkFlat: "",
    benchmarkPercent: "",
    benchmarkSource: "",
    liteMonthlyCap: "",
    benchmarkTargetRatio: "0.5",
  });

  const ratesQuery = useQuery({
    queryKey: ["platform", "kiorex-rates", marketFilter],
    queryFn: () =>
      apiGet<KiorexRateRow[]>(
        `/api/v1/admin/platform/kiorex-rates${marketFilter ? `?marketId=${encodeURIComponent(marketFilter)}` : ""}`,
      ),
  });

  const marketsQuery = useQuery({
    queryKey: ["platform", "markets", "operable"],
    queryFn: () => apiGet<MarketRow[]>("/api/v1/admin/platform/markets/operable"),
  });

  const markets = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const rates = ratesQuery.data ?? [];

  const selectedMarket = useMemo(
    () => markets.find((m) => m.id === draft.marketId) ?? markets[0],
    [markets, draft.marketId],
  );

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<KiorexRateRow>("/api/v1/admin/platform/kiorex-rates", body),
    onSuccess: () => {
      toast.success(t("platform.kiorex.saved", "Kiorex rate saved"));
      void qc.invalidateQueries({ queryKey: ["platform", "kiorex-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsMut = useMutation({
    mutationFn: (payload: { marketId: string; benchmarkTargetRatio?: number; liteMonthlyCap?: number | null }) =>
      apiPatch(`/api/v1/admin/platform/kiorex-rates/market/${payload.marketId}/settings`, {
        benchmarkTargetRatio: payload.benchmarkTargetRatio,
        liteMonthlyCap: payload.liteMonthlyCap,
      }),
    onSuccess: () => toast.success(t("platform.kiorex.settingsSaved", "Market Kiorex settings saved")),
    onError: (e: Error) => toast.error(e.message),
  });

  const submitRate = () => {
    if (!draft.marketId) return;
    createMut.mutate({
      marketId: draft.marketId,
      specialty: draft.specialty || null,
      feeType: draft.feeType,
      amount: draft.feeType === "FLAT" && draft.amount ? Number(draft.amount) : null,
      percent: draft.feeType === "PERCENT" && draft.percent ? Number(draft.percent) : null,
      minAmount: draft.minAmount ? Number(draft.minAmount) : null,
      maxAmount: draft.maxAmount ? Number(draft.maxAmount) : null,
      benchmarkFlat: draft.benchmarkFlat ? Number(draft.benchmarkFlat) : null,
      benchmarkPercent: draft.benchmarkPercent ? Number(draft.benchmarkPercent) : null,
      benchmarkSource: draft.benchmarkSource || null,
    });
  };

  const saveMarketSettings = () => {
    const marketId = draft.marketId || selectedMarket?.id;
    if (!marketId) return;
    settingsMut.mutate({
      marketId,
      benchmarkTargetRatio: Number(draft.benchmarkTargetRatio),
      liteMonthlyCap: draft.liteMonthlyCap.trim() ? Number(draft.liteMonthlyCap) : null,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.kiorex.title", "Kiorex commission rates")}</CardTitle>
          <CardDescription>
            {t(
              "platform.kiorex.hint",
              "Per-market fees with competitor benchmarks. Warnings appear when a rate exceeds the target ratio (default 50% of lowest competitor).",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Label className="w-full text-xs text-muted-foreground">{t("platform.kiorex.filterMarket", "Filter by market")}</Label>
            <select
              className={nativeSelectClassName}
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
            >
              <option value="">{t("platform.kiorex.allMarkets", "All markets")}</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-3xl text-sm">
              <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("platform.kiorex.colMarket", "Market")}</th>
                  <th className="px-3 py-2">{t("platform.kiorex.colSpecialty", "Specialty")}</th>
                  <th className="px-3 py-2">{t("platform.kiorex.colFee", "Fee")}</th>
                  <th className="px-3 py-2">{t("platform.kiorex.colBenchmark", "Benchmark")}</th>
                  <th className="px-3 py-2">{t("platform.kiorex.colStatus", "Guardrail")}</th>
                </tr>
              </thead>
              <tbody>
                {rates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      {t("platform.kiorex.empty", "No Kiorex rates configured yet.")}
                    </td>
                  </tr>
                ) : (
                  rates.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{r.marketCode}</td>
                      <td className="px-3 py-2">
                        {r.specialty
                          ? t(`clinicalSpecialty.${r.specialty}`, r.specialty)
                          : t("platform.kiorex.marketDefault", "Market default")}
                      </td>
                      <td className="px-3 py-2 ltr-nums">
                        {r.feeType === "FLAT"
                          ? `${r.amount} ${r.currency}`
                          : `${r.percent}% (${t("platform.kiorex.example", "e.g.")} ${r.effectiveFeeExample ?? "—"} ${r.currency})`}
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {r.benchmarkFlat ? `${r.benchmarkFlat} ${r.currency}` : null}
                        {r.benchmarkPercent ? `${r.benchmarkPercent}%` : null}
                        {r.benchmarkSource ? ` · ${r.benchmarkSource}` : null}
                      </td>
                      <td className="px-3 py-2">
                        {r.aboveBenchmarkTarget ? (
                          <Badge variant="outline" className="border-destructive/50 bg-destructive/10 font-normal text-destructive">
                            {t("platform.kiorex.aboveTarget", "Above {{pct}}% target", {
                              pct: Math.round(r.benchmarkTargetRatio * 100),
                            })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            {t("platform.kiorex.onTarget", "On target")}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.kiorex.addRate", "Add rate")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>{t("platform.kiorex.market", "Market")}</Label>
            <select
              className={nativeSelectClassName}
              value={draft.marketId || selectedMarket?.id || ""}
              onChange={(e) => setDraft((d) => ({ ...d, marketId: e.target.value }))}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("platform.kiorex.specialty", "Specialty (optional)")}</Label>
            <select
              className={nativeSelectClassName}
              value={draft.specialty}
              onChange={(e) => setDraft((d) => ({ ...d, specialty: e.target.value }))}
            >
              {SPECIALTIES.map((s) => (
                <option key={s || "default"} value={s}>
                  {s ? t(`clinicalSpecialty.${s}`, s) : t("platform.kiorex.marketDefault", "Market default")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("platform.kiorex.feeType", "Fee type")}</Label>
            <select
              className={nativeSelectClassName}
              value={draft.feeType}
              onChange={(e) => setDraft((d) => ({ ...d, feeType: e.target.value }))}
            >
              <option value="FLAT">FLAT</option>
              <option value="PERCENT">PERCENT</option>
            </select>
          </div>
          {draft.feeType === "FLAT" ? (
            <div className="space-y-1">
              <Label>{t("platform.kiorex.amount", "Amount")}</Label>
              <Input value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label>{t("platform.kiorex.percent", "Percent")}</Label>
                <Input value={draft.percent} onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("platform.kiorex.minAmount", "Min amount")}</Label>
                <Input
                  value={draft.minAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("platform.kiorex.maxAmount", "Max amount")}</Label>
                <Input
                  value={draft.maxAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, maxAmount: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>{t("platform.kiorex.benchmarkFlat", "Lowest competitor (flat)")}</Label>
            <Input
              value={draft.benchmarkFlat}
              onChange={(e) => setDraft((d) => ({ ...d, benchmarkFlat: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("platform.kiorex.benchmarkPercent", "Lowest competitor (%)")}</Label>
            <Input
              value={draft.benchmarkPercent}
              onChange={(e) => setDraft((d) => ({ ...d, benchmarkPercent: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("platform.kiorex.benchmarkSource", "Benchmark source note")}</Label>
            <Input
              value={draft.benchmarkSource}
              onChange={(e) => setDraft((d) => ({ ...d, benchmarkSource: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" disabled={createMut.isPending} onClick={submitRate}>
              {t("platform.kiorex.saveRate", "Save rate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.kiorex.marketSettings", "Market settings")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>{t("platform.kiorex.targetRatio", "Benchmark target ratio")}</Label>
            <Input
              className="w-28 ltr-nums"
              value={draft.benchmarkTargetRatio}
              onChange={(e) => setDraft((d) => ({ ...d, benchmarkTargetRatio: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("platform.kiorex.liteCap", "Lite monthly cap (optional)")}</Label>
            <Input
              className="w-36 ltr-nums"
              value={draft.liteMonthlyCap}
              onChange={(e) => setDraft((d) => ({ ...d, liteMonthlyCap: e.target.value }))}
            />
          </div>
          <Button type="button" variant="secondary" disabled={settingsMut.isPending} onClick={saveMarketSettings}>
            {t("platform.kiorex.saveSettings", "Save settings")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}