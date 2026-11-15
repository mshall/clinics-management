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
import { apiGet, apiPatch, apiPost } from "@/lib/http";
import type { TenantFeatureFlagRow } from "@/features/admin/tenant-feature-flags-panel";
import { Badge } from "@/components/ui/badge";
import { featureFlagLabel } from "@/lib/feature-flag-labels";

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
};

const HOST_CELLS = [
  { id: "frankfurt", label: "Frankfurt (eu-central-1)" },
  { id: "me-dubai", label: "Middle East — Dubai (planned)" },
  { id: "egypt-local", label: "Egypt in-country (planned)" },
] as const;

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

  const rows = marketsQuery.data ?? [];
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
                          <span
                            className={
                              m.status === "LIVE"
                                ? "rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                                : "rounded bg-muted px-2 py-0.5"
                            }
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setFlagsMarketId(m.id)}>
                              {t("platform.marketFlags", "Flags")}
                            </Button>
                            {m.status === "DRAFT" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={launchMut.isPending}
                                onClick={() => launchMut.mutate(m.id)}
                              >
                                {t("platform.launchMarket", "Go live")}
                              </Button>
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
              <Label>{t("platform.marketCode", "ISO country code")}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AE" maxLength={8} />
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
              <Label>{t("platform.hostCell", "Cloud host cell")}</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={hostCell}
                onChange={(e) => {
                  const v = e.target.value;
                  setHostCell(v);
                  if (v === "frankfurt") setDataRegion("eu-central-1");
                }}
              >
                {HOST_CELLS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("platform.dataRegion", "AWS data region")}</Label>
              <Input value={dataRegion} onChange={(e) => setDataRegion(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("admin.baseCurrency", "Currency")}</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="EGP" />
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
    </div>
  );
}