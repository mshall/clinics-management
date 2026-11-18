import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";
import type { TenantFeatureFlagRow } from "@/features/admin/tenant-feature-flags-panel";
import { Badge } from "@/components/ui/badge";
import { featureFlagLabel } from "@/lib/feature-flag-labels";
import { AWS_DATA_REGIONS, BASE_CURRENCY_OPTIONS, MARKET_COUNTRY_OPTIONS } from "@/lib/market-pack-options";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { PlatformCommercialConfigDialog } from "./platform-commercial-config-dialog";
import { PlatformLegalConfigDialog } from "./platform-legal-config-dialog";

export type MarketRow = {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  status: "DRAFT" | "LIVE" | "SUNSET";
  launchedAt: string | null;
  dataRegion: string;
  hostCell: string;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultPhoneRegion: string;
  operationalStatus?: string;
  operability?: string;
  pausedUntil?: string | null;
  lastProvisionNote?: string | null;
  acceptsNewOrganizations?: boolean;
  crossBorderRequired?: boolean;
  crossBorderApprovalRef?: string | null;
  crossBorderExpiresAt?: string | null;
  legalLaunchApproved?: boolean;
  legalExpiresInDays?: number | null;
};

export function PlatformMarketsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [hostCell, setHostCell] = useState("frankfurt");
  const [dataRegion, setDataRegion] = useState("eu-central-1");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [err, setErr] = useState<string | null>(null);
  const [flagsMarketId, setFlagsMarketId] = useState<string | null>(null);
  const [commercialMarketId, setCommercialMarketId] = useState<string | null>(null);
  const [legalMarketId, setLegalMarketId] = useState<string | null>(null);

  const marketsQuery = useQuery({
    queryKey: ["platform", "markets"],
    queryFn: () => apiGet<MarketRow[]>("/api/v1/admin/platform/markets"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<MarketRow>("/api/v1/admin/platform/markets", {
        code: code.trim(),
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim() || undefined,
        hostCell,
        dataRegion,
        defaultCurrency: currency.trim() || undefined,
        defaultTimezone: timezone.trim() || undefined,
      }),
    onSuccess: () => {
      setErr(null);
      setOpen(false);
      setCode("");
      setNameEn("");
      setNameAr("");
      void qc.invalidateQueries({ queryKey: ["platform", "markets"] });
    },
    onError: (e: unknown) => setErr(apiErrorMessage(e)),
  });

  const launchMut = useMutation({
    mutationFn: (id: string) => apiPost<MarketRow>(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}/launch`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "markets"] }),
  });

  const pauseMut = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      apiPost(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}/pause`, { days }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "markets"] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}/disable`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "markets"] }),
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}/enable`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "markets"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "markets"] }),
  });

  const rows = marketsQuery.data ?? [];
  const commercialMarket = rows.find((m) => m.id === commercialMarketId);
  const legalMarket = rows.find((m) => m.id === legalMarketId);
  const live = rows.filter((m) => m.status === "LIVE");

  const marketFlagsQuery = useQuery({
    queryKey: ["platform", "markets", flagsMarketId, "feature-flags"],
    queryFn: () =>
      apiGet<TenantFeatureFlagRow[]>(
        `/api/v1/admin/platform/markets/${encodeURIComponent(flagsMarketId!)}/feature-flags`,
      ),
    enabled: Boolean(flagsMarketId),
  });

  const patchMarketFlag = useMutation({
    mutationFn: ({ marketId, key, enabled }: { marketId: string; key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/platform/markets/${encodeURIComponent(marketId)}/feature-flags/${encodeURIComponent(key)}`, {
        enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "markets", flagsMarketId, "feature-flags"] });
      void qc.invalidateQueries({ queryKey: ["assistant"] });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("platform.marketsTitle", "Market launch")}</CardTitle>
            <CardDescription>
              {t(
                "platform.marketsHint",
                "Country packs define currency, timezone, tax and payment methods. Egypt runs on the Frankfurt cell until in-country consent is granted.",
              )}
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setOpen(true)}>
            {t("platform.newMarket", "Initiate country launch")}
          </Button>
        </CardHeader>
        <CardContent>
          {marketsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {t("platform.marketsLiveCount", "{{count}} live market(s)", { count: live.length })}
              </p>
              <ResponsiveTable>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("platform.marketCode", "Code")}</th>
                      <th className="px-3 py-2 text-start">{t("platform.marketName", "Market")}</th>
                      <th className="px-3 py-2 text-start">{t("platform.hostCell", "Host cell")}</th>
                      <th className="px-3 py-2 text-start">{t("platform.dataRegion", "Data region")}</th>
                      <th className="px-3 py-2 text-start">{t("platform.status", "Status")}</th>
                      <th className="px-3 py-2 text-start">{t("platform.legal.column", "Transfer approval")}</th>
                      <th className="px-3 py-2 text-end">{t("common.actions", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{m.code}</td>
                        <td className="px-3 py-2">
                          {m.nameEn}
                          {m.nameAr ? <span className="text-muted-foreground"> · {m.nameAr}</span> : null}
                        </td>
                        <td className="px-3 py-2">{m.hostCell}</td>
                        <td className="px-3 py-2 font-mono text-xs">{m.dataRegion}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span
                              className={
                                m.status === "LIVE"
                                  ? "rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400 w-fit"
                                  : "rounded bg-muted px-2 py-0.5 w-fit"
                              }
                            >
                              {m.status}
                            </span>
                            {m.status === "LIVE" && m.operability ? (
                              <Badge variant={m.operability === "active" ? "default" : "secondary"} className="w-fit">
                                {m.operability}
                                {m.pausedUntil ? ` → ${new Date(m.pausedUntil).toLocaleDateString()}` : ""}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.crossBorderRequired ? (
                            m.legalLaunchApproved ? (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {m.crossBorderApprovalRef ??
                                  t("platform.legal.pilotOnly", "Pilot exception")}
                                {m.legalExpiresInDays != null && m.legalExpiresInDays <= 60 ? (
                                  <span className="block text-amber-700 dark:text-amber-400">
                                    {t("platform.legal.expiresSoon", "{{days}}d to expiry", {
                                      days: m.legalExpiresInDays,
                                    })}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                {t("platform.legal.missingShort", "Missing approval")}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setFlagsMarketId(m.id)}>
                              {t("platform.marketFlags", "Flags")}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setCommercialMarketId(m.id)}>
                              {t("platform.commercial.open", "Commercial")}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setLegalMarketId(m.id)}>
                              {t("platform.legal.open", "Legal")}
                            </Button>
                            {m.status === "DRAFT" ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={launchMut.isPending}
                                  onClick={() => launchMut.mutate(m.id)}
                                >
                                  {t("platform.launchMarket", "Go live")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={deleteMut.isPending}
                                  onClick={() => deleteMut.mutate(m.id)}
                                >
                                  {t("common.delete", "Delete")}
                                </Button>
                              </>
                            ) : m.status === "LIVE" ? (
                              <>
                                {m.operability === "disabled" || m.operability === "paused" ? (
                                  <Button type="button" size="sm" variant="outline" onClick={() => enableMut.mutate(m.id)}>
                                    {t("platform.marketEnable", "Enable")}
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const raw = window.prompt(t("platform.pauseDaysPrompt", "Pause for how many days?"), "7");
                                        const days = Number.parseInt(raw ?? "", 10);
                                        if (Number.isFinite(days) && days > 0) pauseMut.mutate({ id: m.id, days });
                                      }}
                                    >
                                      {t("platform.marketPause", "Pause")}
                                    </Button>
                                    <Button type="button" size="sm" variant="ghost" onClick={() => disableMut.mutate(m.id)}>
                                      {t("platform.marketDisable", "Disable")}
                                    </Button>
                                  </>
                                )}
                              </>
                            ) : m.launchedAt ? (
                              <span className="text-xs text-muted-foreground ltr-nums self-center">
                                {new Date(m.launchedAt).toLocaleDateString()}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </>
          )}
        </CardContent>
      </Card>

      {flagsMarketId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.marketCountryFlags", "Country feature flags")}</CardTitle>
            <CardDescription>
              {t(
                "platform.marketFlagsHint",
                "Turn features on or off for every organization in {{market}}. AI assistant uses ai_assistant.",
                { market: rows.find((r) => r.id === flagsMarketId)?.nameEn ?? "" },
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {marketFlagsQuery.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              (marketFlagsQuery.data ?? []).map((f) => (
                <div key={f.key} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{featureFlagLabel(t, f.key, f.description)}</span>
                    <Badge variant={(f.marketEnabled ?? f.effective) ? "default" : "secondary"}>
                      {(f.marketEnabled ?? f.effective) ? t("platform.flagOn", "On") : t("platform.flagOff", "Off")}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{f.key}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={patchMarketFlag.isPending}
                    onClick={() => {
                      const on = f.marketEnabled ?? f.effective;
                      patchMarketFlag.mutate({
                        marketId: flagsMarketId,
                        key: f.key,
                        enabled: !on,
                      });
                    }}
                  >
                    {t("admin.toggle")}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("platform.newMarket", "Initiate country launch")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{t("platform.marketCode", "Country (ISO)")}</Label>
              <select
                className={`w-full ${nativeSelectClassName}`}
                value={code}
                onChange={(e) => {
                  const c = MARKET_COUNTRY_OPTIONS.find((x) => x.code === e.target.value);
                  if (!c) return;
                  setCode(c.code);
                  setNameEn(c.nameEn);
                  setNameAr(c.nameAr);
                  setCurrency(c.defaultCurrency);
                  setTimezone(c.defaultTimezone);
                }}
              >
                <option value="">{t("platform.pickCountry", "Select country…")}</option>
                {MARKET_COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("platform.marketNameEn", "Name (English)")}</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>{t("platform.marketNameAr", "Name (Arabic)")}</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
            <div>
              <Label>{t("platform.dataRegion", "AWS data region")}</Label>
              <select
                className={`w-full ${nativeSelectClassName}`}
                value={dataRegion}
                onChange={(e) => {
                  const id = e.target.value;
                  setDataRegion(id);
                  setHostCell(id.split("-").pop() ?? id);
                }}
              >
                {AWS_DATA_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("admin.baseCurrency", "Currency")}</Label>
                <select
                  className={`w-full ${nativeSelectClassName}`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="">{t("platform.autoCurrency", "Auto from country")}</option>
                  {BASE_CURRENCY_OPTIONS.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("platform.timezone", "Default timezone")}</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Africa/Cairo" />
              </div>
            </div>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
            <Button
              type="button"
              disabled={createMut.isPending || !code.trim() || !nameEn.trim()}
              onClick={() => createMut.mutate()}
            >
              {t("platform.saveDraftMarket", "Save as draft")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PlatformCommercialConfigDialog
        marketId={commercialMarketId}
        marketLabel={commercialMarket ? `${commercialMarket.code} — ${commercialMarket.nameEn}` : undefined}
        open={Boolean(commercialMarketId)}
        onOpenChange={(next) => {
          if (!next) setCommercialMarketId(null);
        }}
      />
      <PlatformLegalConfigDialog
        marketId={legalMarketId}
        marketLabel={legalMarket ? `${legalMarket.code} — ${legalMarket.nameEn}` : undefined}
        open={Boolean(legalMarketId)}
        onOpenChange={(next) => {
          if (!next) setLegalMarketId(null);
        }}
      />
    </div>
  );
}