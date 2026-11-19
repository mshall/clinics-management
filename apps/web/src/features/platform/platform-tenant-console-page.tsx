import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    planKey: string;
    planNameEn: string;
    trialEndsAt: string | null;
    clinicianSeats: number;
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

export function PlatformTenantConsolePage() {
  const { t } = useTranslation();
  const { tenantId = "" } = useParams();
  const qc = useQueryClient();
  const [trialDays, setTrialDays] = useState("14");
  const [trialReason, setTrialReason] = useState("Ops extend");
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditReason, setCreditReason] = useState("Ops grant");
  const [accessReason, setAccessReason] = useState("Help with support ticket");

  const q = useQuery({
    queryKey: ["platform", "tenant", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => apiGet<TenantLifecycleDto>(`/api/v1/admin/platform/tenants/${tenantId}`),
  });

  const extendTrial = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/extend-trial`, {
        days: Number(trialDays),
        reason: trialReason.trim(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "tenant", tenantId] }),
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
            <CardContent className="space-y-1 text-sm">
              {d.subscription ? (
                <>
                  <p>
                    {d.subscription.planNameEn} ({d.subscription.planKey}) — {d.subscription.status}
                  </p>
                  <p className="ltr-nums">
                    Seats {d.subscription.clinicianSeats} · period ends {d.subscription.currentPeriodEnd ?? "—"}
                  </p>
                  <p className="ltr-nums">Price lock until {d.subscription.priceLockUntil ?? "—"}</p>
                  <p>Rep: {d.salesRepCode ?? "—"}</p>
                </>
              ) : (
                <p>{t("platform.lifecycleEmpty", "None")}</p>
              )}
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
                <div className="min-w-[12rem] flex-1">
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
                <div className="min-w-[12rem] flex-1">
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
