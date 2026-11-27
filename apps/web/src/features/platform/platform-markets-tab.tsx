import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";
import type { TenantFeatureFlagRow } from "@/features/admin/tenant-feature-flags-panel";
import { Badge } from "@/components/ui/badge";
import { ManagedFlagsBanner } from "@/features/flags/managed-flags-banner";
import { useFlagStatus } from "@/features/flags/use-flag-status";
import { featureFlagLabel } from "@/lib/feature-flag-labels";
import { AWS_DATA_REGIONS, BASE_CURRENCY_OPTIONS, MARKET_COUNTRY_OPTIONS } from "@/lib/market-pack-options";
import { fill, marketStrings } from "./platform-markets-strings";
import { type LaunchForm, type LaunchFormField, type ReadinessLike, type TransitionKind, applyCountry, emptyLaunchForm, hostCellForRegion, messageForError, toCreateBody, validateLaunchForm } from "./platform-markets-logic";
import { MarketActionDialog, MarketHistoryDialog, MarketPrerequisitesDialog } from "./platform-market-dialogs";
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
  requireSecondApprover?: boolean;
  organizationCount?: number | null;
  readiness?: ReadinessLike & { taxPack: { ok: boolean; invoiceVatPercent?: number; saasVatPercent?: number; defaultVisitFee?: number; trnRequired?: boolean; trnFormat?: string | null }; commercialConfigured?: boolean };
};

export function PlatformMarketsTab() {
  const { t, i18n } = useTranslation();
  const s = marketStrings(i18n.resolvedLanguage ?? i18n.language);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LaunchForm>(emptyLaunchForm());
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [pageNote, setPageNote] = useState<string | null>(null);
  const [action, setAction] = useState<{ market: MarketRow; kind: TransitionKind } | null>(null);
  const [historyFor, setHistoryFor] = useState<MarketRow | null>(null);
  const [prereqFor, setPrereqFor] = useState<string | null>(null);
  const [flagsMarketId, setFlagsMarketId] = useState<string | null>(null);
  const flagStatus = useFlagStatus();
  const flagsReadOnly = flagStatus.data?.managed ?? false;
  const [commercialMarketId, setCommercialMarketId] = useState<string | null>(null);
  const [legalMarketId, setLegalMarketId] = useState<string | null>(null);
  const invalid = validateLaunchForm(form);
  const fieldErr = (f: LaunchFormField) => (touched && invalid[f] ? <p className="text-xs text-destructive" role="alert">{(s.errors.field as Record<string, string>)[f]}</p> : null);

  const marketsQuery = useQuery({
    queryKey: ["platform", "markets"],
    queryFn: () => apiGet<MarketRow[]>("/api/v1/admin/platform/markets"),
  });

  const createMut = useMutation({
    mutationFn: () => apiPost<MarketRow>("/api/v1/admin/platform/markets", toCreateBody(form)),
    onSuccess: () => {
      setErr(null);
      setOpen(false);
      setForm(emptyLaunchForm());
      setTouched(false);
      void qc.invalidateQueries({ queryKey: ["platform", "markets"] });
    },
    onError: (e: unknown) => setErr(messageForError(e, s.errors, "", s.errors.generic)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/platform/markets/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setPageErr(null);
      void qc.invalidateQueries({ queryKey: ["platform", "markets"] });
    },
    onError: (e: unknown) => setPageErr(messageForError(e, s.errors, "", s.errors.generic)),
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
            <CardTitle className="text-base">{s.title}</CardTitle>
            <CardDescription>{s.hint}</CardDescription>
          </div>
          <Button type="button" onClick={() => setOpen(true)} data-testid="market-new">
            {s.newMarket}
          </Button>
        </CardHeader>
        <CardContent>
          {pageErr ? (
            <p role="alert" className="mb-3 text-sm text-destructive" data-testid="market-page-error">
              {pageErr}
            </p>
          ) : null}
          {pageNote ? (
            <p role="status" className="mb-3 text-sm text-[hsl(var(--success))]" data-testid="market-page-note">
              {pageNote}
            </p>
          ) : null}
          {marketsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : marketsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">{s.loadError}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{fill(s.liveCount, { count: live.length })}</p>
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">{s.empty}</p> : null}
              <ResponsiveTable>
                <table className="w-full min-w-[820px] text-sm" data-testid="market-table">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start">{s.col.code}</th>
                      <th className="px-3 py-2 text-start">{s.col.market}</th>
                      <th className="px-3 py-2 text-start">{s.col.region}</th>
                      <th className="px-3 py-2 text-start">{s.col.status}</th>
                      <th className="px-3 py-2 text-start">{s.col.prerequisites}</th>
                      <th className="px-3 py-2 text-end">{s.col.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-t border-border" data-testid={`market-row-${m.code}`}>
                        <td className="px-3 py-2 font-mono" dir="ltr">{m.code}</td>
                        <td className="px-3 py-2">
                          {m.nameEn}
                          {m.nameAr ? <span className="text-muted-foreground"> · {m.nameAr}</span> : null}
                          {typeof m.organizationCount === "number" ? <span className="block text-xs text-muted-foreground">{s.col.orgs}: {m.organizationCount}</span> : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                          {m.dataRegion}
                          <span className="block text-muted-foreground">{m.hostCell}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span className={m.status === "LIVE" ? "w-fit rounded bg-emerald-500/15 px-2 py-0.5 text-[hsl(var(--success))]" : "w-fit rounded bg-muted px-2 py-0.5"} data-testid="market-status">
                              {s.status[m.status]}
                            </span>
                            {m.status === "LIVE" && m.operability ? (
                              <Badge variant={m.operability === "active" ? "default" : "secondary"} className="w-fit" data-testid="market-operability">
                                {(s.status as Record<string, string>)[m.operability] ?? m.operability}
                                {m.pausedUntil ? ` → ${new Date(m.pausedUntil).toLocaleDateString()}` : ""}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <PrereqCell m={m} s={s} />
                        </td>
                        <td className="px-3 py-2 text-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setFlagsMarketId(m.id)}>{s.act.flags}</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setCommercialMarketId(m.id)}>{s.act.commercial}</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setLegalMarketId(m.id)}>{s.act.legal}</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setPrereqFor(m.id)} data-testid={`market-prereq-${m.code}`}>{s.act.prerequisites}</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryFor(m)} data-testid={`market-history-${m.code}`}>{s.act.history}</Button>
                            {m.status === "DRAFT" ? (
                              <>
                                <Button type="button" size="sm" variant="outline" onClick={() => setAction({ market: m, kind: "LAUNCH" })} data-testid={`market-golive-${m.code}`}>{s.act.goLive}</Button>
                                <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(m.id)}>{s.act.delete}</Button>
                              </>
                            ) : m.status === "LIVE" ? (
                              m.operability === "disabled" || m.operability === "paused" ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => setAction({ market: m, kind: "ENABLE" })} data-testid={`market-enable-${m.code}`}>{s.act.enable}</Button>
                              ) : (
                                <>
                                  <Button type="button" size="sm" variant="outline" onClick={() => setAction({ market: m, kind: "PAUSE" })} data-testid={`market-pause-${m.code}`}>{s.act.pause}</Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => setAction({ market: m, kind: "DISABLE" })} data-testid={`market-disable-${m.code}`}>{s.act.disable}</Button>
                                </>
                              )
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
            <div className="sm:col-span-2">
              <ManagedFlagsBanner />
            </div>
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
                  {flagsReadOnly ? null : (
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
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={(o) => { if (!createMut.isPending) setOpen(o); }}>
        <DialogContent className="max-w-xl" data-testid="market-create">
          <DialogHeader>
            <DialogTitle>{s.form.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="mk-country">{s.form.country}</Label>
              <select id="mk-country" className={`w-full ${nativeSelectClassName}`} value={form.code} onChange={(e) => setForm((f) => applyCountry(f, e.target.value))}>
                <option value="">{s.form.pickCountry}</option>
                {MARKET_COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} - {c.nameEn}</option>
                ))}
              </select>
              {fieldErr("code")}
              <p className="mt-1 text-xs text-muted-foreground">{s.form.defaultsNote}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mk-name-en">{s.form.nameEn}</Label>
                <Input id="mk-name-en" value={form.nameEn} maxLength={200} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
                {fieldErr("nameEn")}
              </div>
              <div>
                <Label htmlFor="mk-name-ar">{s.form.nameAr}</Label>
                <Input id="mk-name-ar" value={form.nameAr} maxLength={200} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mk-region">{s.form.region}</Label>
                <select id="mk-region" className={`w-full ${nativeSelectClassName}`} value={form.dataRegion} onChange={(e) => setForm({ ...form, dataRegion: e.target.value, hostCell: hostCellForRegion(e.target.value) })}>
                  {AWS_DATA_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} ({r.id})</option>
                  ))}
                </select>
                {fieldErr("region")}
              </div>
              <div>
                <Label htmlFor="mk-cell">{s.form.hostCell}</Label>
                <Input id="mk-cell" value={form.hostCell} dir="ltr" onChange={(e) => setForm({ ...form, hostCell: e.target.value })} />
                {fieldErr("hostCell")}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mk-currency">{s.form.currency}</Label>
                <select id="mk-currency" className={`w-full ${nativeSelectClassName}`} value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                  <option value="" />
                  {BASE_CURRENCY_OPTIONS.map((cur) => (
                    <option key={cur} value={cur}>{cur}</option>
                  ))}
                </select>
                {fieldErr("currency")}
              </div>
              <div>
                <Label htmlFor="mk-tz">{s.form.timezone}</Label>
                <Input id="mk-tz" value={form.defaultTimezone} dir="ltr" onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} placeholder="Africa/Cairo" />
                {fieldErr("timezone")}
              </div>
              <div>
                <Label htmlFor="mk-locale">{s.form.locale}</Label>
                <Input id="mk-locale" value={form.defaultLocale} dir="ltr" onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })} placeholder="ar-EG" />
                {fieldErr("locale")}
              </div>
              <div>
                <Label htmlFor="mk-phone">{s.form.phoneRegion}</Label>
                <Input id="mk-phone" value={form.defaultPhoneRegion} dir="ltr" maxLength={2} onChange={(e) => setForm({ ...form, defaultPhoneRegion: e.target.value.toUpperCase() })} placeholder="EG" />
                {fieldErr("phoneRegion")}
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">{s.form.weekend}</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {s.form.days.map((d, i) => (
                  <label key={i} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={form.weekendDays.includes(i)} onChange={(e) => setForm({ ...form, weekendDays: e.target.checked ? [...form.weekendDays, i] : form.weekendDays.filter((x) => x !== i) })} />
                    {d}
                  </label>
                ))}
              </div>
              {fieldErr("weekend")}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">{s.form.languages}</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {["ar", "en"].map((l) => (
                  <label key={l} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={form.enabledLanguages.includes(l)} onChange={(e) => setForm({ ...form, enabledLanguages: e.target.checked ? [...form.enabledLanguages, l] : form.enabledLanguages.filter((x) => x !== l) })} />
                    {l}
                  </label>
                ))}
              </div>
              {fieldErr("languages")}
            </fieldset>
            {err ? <p role="alert" className="text-sm text-destructive" data-testid="market-create-error">{err}</p> : null}
            <Button
              type="button"
              data-testid="market-create-save"
              disabled={createMut.isPending}
              onClick={() => {
                if (createMut.isPending) return;
                setTouched(true);
                if (Object.keys(validateLaunchForm(form)).length) return;
                setErr(null);
                createMut.mutate();
              }}
            >
              {createMut.isPending ? s.form.saving : s.form.save}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {action ? (
        <MarketActionDialog
          market={action.market}
          kind={action.kind}
          onClose={() => setAction(null)}
          onDone={(note) => {
            setAction(null);
            setPageErr(null);
            setPageNote(note ?? null);
            void qc.invalidateQueries({ queryKey: ["platform", "markets"] });
          }}
        />
      ) : null}
      {historyFor ? <MarketHistoryDialog market={historyFor} onClose={() => setHistoryFor(null)} /> : null}
      {prereqFor && rows.find((m) => m.id === prereqFor) ? (
        <MarketPrerequisitesDialog
          market={rows.find((m) => m.id === prereqFor)!}
          onClose={() => setPrereqFor(null)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["platform", "markets"] })}
        />
      ) : null}

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

function PrereqCell({ m, s }: { m: MarketRow; s: ReturnType<typeof marketStrings> }) {
  const r = m.readiness;
  if (!r) return <span className="text-muted-foreground">-</span>;
  const line = (ok: boolean, yes: string, no: string) => <span className={ok ? "block text-[hsl(var(--success))]" : "block text-[hsl(var(--warning))]"}>{ok ? yes : no}</span>;
  return (
    <div data-testid="market-prereq-cell">
      {line(r.taxPack.ok, s.prereq.taxOk, s.prereq.taxMissing)}
      {r.crossBorder.required ? line(r.crossBorder.approved, m.crossBorderApprovalRef ?? s.prereq.transferOk, s.prereq.transferMissing) : <span className="block text-muted-foreground">{s.prereq.transferNotRequired}</span>}
      {!r.hostCellKnown ? <span className="block text-[hsl(var(--warning))]">{s.prereq.cellMissing}</span> : null}
      {m.status === "DRAFT" ? <span className="mt-1 block font-medium">{r.canLaunch ? s.prereq.ready : s.prereq.notReady}</span> : null}
    </div>
  );
}
