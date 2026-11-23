import type { TranslateFn } from "@/lib/translate-fn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetPlanConfirmDialog } from "@/features/platform/set-plan-confirm-dialog";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type TenantLifecycleDto = {
  id: string;
  name: string;
  nameAr: string;
  status: string;
  marketCode: string | null;
  salesRepCode: string | null;
  activationScore: number;
  counts: { users: number; clinics: number; patients: number };
  subscription: {
    status: string;
    interval?: string;
    planKey: string;
    planNameEn: string;
    trialEndsAt: string | null;
    clinicianSeats: number;
    currentPeriodStart?: string | null;
    currentPeriodEnd: string | null;
    priceLockUntil: string | null;
  } | null;
  trial: { endsAt: string | null; activatedAt: string | null };
  wallet: { balance: number; currency: string };
  entitlementOverrides: Array<{ key: string; reason: string; createdAt: string }>;
  kiorexListings: Array<{ id: string; status: string; clinicianId: string }>;
  verifications: Array<{ id: string; status: string; userId: string }>;
  invoices: Array<{ id: string; status: string; total: number; currency: string; periodKey: string }>;
  events: Array<{ id: string; action: string; createdAt: string; resource: string }>;
};

function formatPeriodEnd(iso: string | null | undefined, language: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeForLanguage(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPeriodRelative(
  iso: string | null | undefined,
  t: TranslateFn,
): string | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return t("platform.periodEnded", "Period has ended");
  const days = Math.round(ms / 86_400_000);
  if (days >= 330) {
    const years = Math.max(1, Math.round(days / 365));
    return t("platform.periodInYears", "in about {{count}} year(s)", { count: years });
  }
  if (days >= 25) {
    const months = Math.max(1, Math.round(days / 30));
    return t("platform.periodInMonths", "in about {{count}} month(s)", { count: months });
  }
  return t("platform.periodInDays", "in about {{count}} day(s)", { count: days });
}

export function PlatformTenantConsolePage() {
  const { t, i18n } = useTranslation();
  const { tenantId = "" } = useParams();
  const qc = useQueryClient();
  const [trialDays, setTrialDays] = useState("14");
  const [trialReason, setTrialReason] = useState("Ops extend");
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditReason, setCreditReason] = useState("Ops grant");
  const [accessReason, setAccessReason] = useState("Help with support ticket");
  const [planKey, setPlanKey] = useState("CLINIC");
  const [planSeats, setPlanSeats] = useState("5");
  const [planInterval, setPlanInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [planReason, setPlanReason] = useState("Ops plan assignment");
  const [setPlanConfirmOpen, setSetPlanConfirmOpen] = useState(false);

  const q = useQuery({
    queryKey: ["platform", "tenant", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => apiGet<TenantLifecycleDto>(`/api/v1/admin/platform/tenants/${tenantId}`),
  });

  useSyncOnChange([q.data?.subscription?.planKey, q.data?.subscription?.clinicianSeats, q.data?.subscription?.interval], () => {
    if (!q.data?.subscription) return;
    setPlanKey(q.data.subscription.planKey);
    setPlanSeats(String(q.data.subscription.clinicianSeats));
    if (q.data.subscription.interval === "ANNUAL" || q.data.subscription.interval === "MONTHLY") {
      setPlanInterval(q.data.subscription.interval);
    }
  });

  const extendTrial = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/extend-trial`, {
        days: Number(trialDays),
        reason: trialReason.trim(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] }),
  });

  const setPlan = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/set-plan`, {
        planKey,
        interval: planInterval,
        clinicianSeats: Math.max(1, Number.parseInt(planSeats, 10) || 1),
        reason: planReason.trim(),
        status: "ACTIVE",
      }),
    onSuccess: () => {
      setSetPlanConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] });
    },
  });

  const grantCredit = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/credits`, {
        amount: Number(creditAmount),
        reason: "GOODWILL",
        note: creditReason.trim() || "Ops grant",
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] }),
  });

  const requestSupportAccess = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/support/access-requests`, {
        tenantId,
        reason: accessReason.trim() || "Ops support",
        durationMinutes: 60,
        requestedUnmaskPhi: false,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] }),
  });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError || !q.data) {
    return <p className="text-sm text-destructive">{t("common.error", "Could not load tenant")}</p>;
  }
  const d = q.data;

  return (
    <div className="space-y-4" data-testid="platform-tenant-console">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/platform/organizations" className="text-sm text-primary underline">
            {t("platform.tabs.organizations", "Organizations")}
          </Link>
          <h1 className="text-xl font-semibold">{d.name}</h1>
          <p className="text-sm text-muted-foreground">
            {d.marketCode ?? "—"} · {d.status} · {t("platform.activationScore", "Activation")} {d.activationScore}%
          </p>
        </div>
        <div className="text-sm text-muted-foreground ltr-nums">
          {d.counts.clinics} clinics · {d.counts.users} users · {d.counts.patients} patients
        </div>
      </div>

      <Tabs defaultValue="subscription">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="subscription">{t("platform.tenantTab.subscription", "Subscription")}</TabsTrigger>
          <TabsTrigger value="trial">{t("platform.tenantTab.trial", "Trial")}</TabsTrigger>
          <TabsTrigger value="wallet">{t("platform.tenantTab.wallet", "Wallet")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("platform.tenantTab.invoices", "Invoices")}</TabsTrigger>
          <TabsTrigger value="entitlements">{t("platform.tenantTab.entitlements", "Entitlements")}</TabsTrigger>
          <TabsTrigger value="kiorex">{t("platform.tenantTab.kiorex", "Kiorex")}</TabsTrigger>
          <TabsTrigger value="verification">{t("platform.tenantTab.verification", "Verification")}</TabsTrigger>
          <TabsTrigger value="events">{t("platform.tenantTab.events", "Events")}</TabsTrigger>
          <TabsTrigger value="supportAccess">{t("platform.tenantTab.supportAccess", "Support access")}</TabsTrigger>
        </TabsList>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("platform.tenantTab.subscription", "Subscription")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {d.subscription ? (
                <div className="space-y-3">
                  <p className="text-base font-medium text-foreground">
                    {d.subscription.planNameEn}{" "}
                    <span className="font-mono text-sm text-muted-foreground">({d.subscription.planKey})</span>
                    <span className="text-muted-foreground"> — {d.subscription.status}</span>
                    {d.subscription.interval ? (
                      <span className="ms-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {d.subscription.interval === "ANNUAL"
                          ? t("platform.billingAnnual", "Annual")
                          : t("platform.billingMonthly", "Monthly")}
                      </span>
                    ) : null}
                  </p>
                  <div
                    className="flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-linear-to-br from-emerald-500/15 to-emerald-600/5 px-4 py-3.5 text-emerald-900 shadow-xs dark:from-emerald-500/20 dark:to-emerald-900/10 dark:text-emerald-200"
                    data-testid="subscription-period-end"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      <Timer className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
                        {t("platform.periodEndsLabel", "Current period ends")}
                      </p>
                      <p className="text-xl font-semibold leading-tight tracking-tight ltr-nums tabular-nums text-emerald-950 dark:text-emerald-50">
                        {formatPeriodEnd(d.subscription.currentPeriodEnd, i18n.language)}
                      </p>
                      {(() => {
                        const relative = formatPeriodRelative(d.subscription.currentPeriodEnd, t);
                        return relative ? (
                          <p className="text-sm font-medium text-emerald-800/90 dark:text-emerald-300/90">
                            {relative}
                          </p>
                        ) : null;
                      })()}
                      <p className="text-xs leading-relaxed text-emerald-800/65 dark:text-emerald-300/65">
                        {d.subscription.interval === "ANNUAL"
                          ? t(
                              "platform.periodEndsAnnualHint",
                              "Billing window is about one year from the last plan assignment.",
                            )
                          : t(
                              "platform.periodEndsMonthlyHint",
                              "Billing window is about one month from the last plan assignment.",
                            )}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground ltr-nums">
                    {t("platform.seatsLabel", "Seats")}: {d.subscription.clinicianSeats}
                    {d.subscription.priceLockUntil
                      ? ` · ${t("platform.priceLockUntil", "Price lock until")} ${formatPeriodEnd(d.subscription.priceLockUntil, i18n.language)}`
                      : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("platform.repLabel", "Rep")}: {d.salesRepCode ?? "—"}
                  </p>
                </div>
              ) : (
                <p>{t("platform.lifecycleEmpty", "None")}</p>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "platform.setPlanHint",
                    "Assign a catalog plan for this organization (ops override). Prefer Monthly unless you know Annual pricing exists for that plan in the market. Clinic+ unlocks Operations; Pro+ unlocks AI assistant.",
                  )}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("platform.setPlanKey", "Plan")}</label>
                    <select
                      className="flex h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
                      value={planKey}
                      onChange={(e) => setPlanKey(e.target.value)}
                      data-testid="platform-set-plan-key"
                    >
                      <option value="LITE">Lite</option>
                      <option value="PRO">Pro</option>
                      <option value="CLINIC">Clinic</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("platform.setPlanInterval", "Interval")}</label>
                    <select
                      className="flex h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
                      value={planInterval}
                      onChange={(e) => setPlanInterval(e.target.value as "MONTHLY" | "ANNUAL")}
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("platform.setPlanSeats", "Seats")}</label>
                    <Input
                      className="w-20 ltr-nums"
                      value={planSeats}
                      onChange={(e) => setPlanSeats(e.target.value)}
                    />
                  </div>
                  <div className="min-w-48 flex-1">
                    <label className="text-xs text-muted-foreground">{t("platform.setPlanReason", "Reason")}</label>
                    <Input value={planReason} onChange={(e) => setPlanReason(e.target.value)} />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={setPlan.isPending || planReason.trim().length < 3}
                    onClick={() => setSetPlanConfirmOpen(true)}
                    data-testid="platform-set-plan-submit"
                  >
                    {t("platform.setPlan", "Set plan")}
                  </Button>
                </div>
                {setPlan.isError ? (
                  <p className="text-xs text-destructive">
                    {(() => {
                      const e = setPlan.error;
                      if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
                      return String(e);
                    })()}
                  </p>
                ) : null}
                {setPlan.isSuccess ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {t("platform.setPlanDone", "Plan updated.")}
                  </p>
                ) : null}
              </div>

              <SetPlanConfirmDialog
                open={setPlanConfirmOpen}
                onOpenChange={setSetPlanConfirmOpen}
                pending={setPlan.isPending}
                values={{
                  planKey,
                  interval: planInterval,
                  seats: Math.max(1, Number.parseInt(planSeats, 10) || 1),
                  reason: planReason.trim(),
                  tenantName: d.name,
                }}
                onConfirm={() => setPlan.mutate()}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial">
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <p className="ltr-nums">Ends {d.trial.endsAt ?? "—"} · activated {d.trial.activatedAt ?? "—"}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Days</label>
                  <Input className="w-24" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
                </div>
                <div className="min-w-48 flex-1">
                  <label className="text-xs text-muted-foreground">Reason</label>
                  <Input value={trialReason} onChange={(e) => setTrialReason(e.target.value)} />
                </div>
                <Button type="button" size="sm" disabled={extendTrial.isPending} onClick={() => extendTrial.mutate()}>
                  {t("platform.extendTrial", "Extend trial")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet">
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <p className="ltr-nums">
                {d.wallet.balance} {d.wallet.currency}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <Input className="w-28" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                </div>
                <div className="min-w-48 flex-1">
                  <label className="text-xs text-muted-foreground">Reason</label>
                  <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} />
                </div>
                <Button type="button" size="sm" disabled={grantCredit.isPending} onClick={() => grantCredit.mutate()}>
                  {t("platform.grantCredits", "Grant credits")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y text-sm">
                {d.invoices.map((inv) => (
                  <li key={inv.id} className="flex justify-between gap-2 py-2 ltr-nums">
                    <span>
                      {inv.periodKey} · {inv.status}
                    </span>
                    <span>
                      {inv.total} {inv.currency}
                    </span>
                  </li>
                ))}
                {d.invoices.length === 0 ? <li className="py-2 text-muted-foreground">{t("platform.lifecycleEmpty", "None")}</li> : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entitlements">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y text-sm">
                {d.entitlementOverrides.map((o) => (
                  <li key={o.key} className="py-2">
                    <div className="font-medium">{o.key}</div>
                    <div className="text-xs text-muted-foreground">{o.reason}</div>
                  </li>
                ))}
                {d.entitlementOverrides.length === 0 ? (
                  <li className="py-2 text-muted-foreground">{t("platform.lifecycleEmpty", "None")}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kiorex">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y text-sm">
                {d.kiorexListings.map((l) => (
                  <li key={l.id} className="py-2 ltr-nums">
                    {l.status} · clinician {l.clinicianId}
                  </li>
                ))}
                {d.kiorexListings.length === 0 ? (
                  <li className="py-2 text-muted-foreground">{t("platform.lifecycleEmpty", "None")}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y text-sm">
                {d.verifications.map((v) => (
                  <li key={v.id} className="py-2">
                    {v.status} · {v.userId}
                  </li>
                ))}
                {d.verifications.length === 0 ? (
                  <li className="py-2 text-muted-foreground">{t("platform.lifecycleEmpty", "None")}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y text-sm">
                {d.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 py-2">
                    <span>{e.action}</span>
                    <span className="text-xs text-muted-foreground ltr-nums">{e.createdAt}</span>
                  </li>
                ))}
                {d.events.length === 0 ? (
                  <li className="py-2 text-muted-foreground">{t("platform.lifecycleEmpty", "None")}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supportAccess">
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <p className="text-muted-foreground">
                {t(
                  "platform.supportAccessHint",
                  "Request a time-boxed session. The clinic owner must approve before any patient chart can be opened (PHI masked by default).",
                )}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[16rem] flex-1">
                  <label className="text-xs text-muted-foreground">{t("platform.supportAccessReason", "Reason")}</label>
                  <Input value={accessReason} onChange={(e) => setAccessReason(e.target.value)} />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={requestSupportAccess.isPending}
                  onClick={() => requestSupportAccess.mutate()}
                >
                  {t("platform.requestSupportAccess", "Request support access")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
