import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { AdminKiorexFreeProgressCard } from "./admin-kiorex-free-progress-card";
import { AdminLiteKiorexFeesCard } from "./admin-lite-kiorex-fees-card";
import { AdminReferralInviteCard } from "./admin-referral-invite-card";
import { useUpgradePaywallStore } from "@/stores/upgrade-paywall-store";
import { PLAN_UPGRADE_REQUIRED } from "@/lib/plan-upgrade-constants";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CreditWalletDto = {
  balance: string;
  currency: string;
  upcomingExpiries: { expiresAt: string; amount: string; entryId: string }[];
  entries: {
    id: string;
    type: string;
    reason: string;
    amount: string;
    remaining: string | null;
    expiresAt: string | null;
    note: string | null;
    createdAt: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
};

type SubscriptionDto = {
  status: string;
  interval: string;
  clinicianSeats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  plan: { key: string; nameEn: string; nameAr: string };
  planPrice: { amount: string; currency: string } | null;
  nextInvoicePreview: { currency: string; subtotal: string; description: string } | null;
};

type UsageMetricSnapshot = {
  metric: string;
  quantity: number;
  limit: number;
  percent: number;
  atLimit: boolean;
  nearLimit: boolean;
};

type UsageSummaryDto = {
  periodKey: string;
  whatsappPaused: boolean;
  metrics: UsageMetricSnapshot[];
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "muted"> = {
  TRIALING: "secondary",
  ACTIVE: "default",
  PAST_DUE: "muted",
  GRACE: "muted",
  READ_ONLY: "outline",
  SUSPENDED: "muted",
  CANCELLED: "outline",
};

export function AdminOrgBillingPanel({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const showPaywall = useUpgradePaywallStore((s) => s.show);
  const qc = useQueryClient();
  const [planKey, setPlanKey] = useState("PRO");
  const [interval, setInterval] = useState("MONTHLY");
  const [seats, setSeats] = useState("1");
  const [planPreview, setPlanPreview] = useState<{
    proration?: {
      netDue: string;
      credit: string;
      charge: string;
      effectiveAt: string;
      timing: string;
      currency: string;
    };
    requiresClinicianSelection?: boolean;
  } | null>(null);

  const subQuery = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiGet<SubscriptionDto>("/api/v1/billing/subscription"),
  });

  const walletQuery = useQuery({
    queryKey: ["billing", "wallet"],
    queryFn: () => apiGet<CreditWalletDto>("/api/v1/billing/wallet?page=1&pageSize=25"),
  });

  const usageQuery = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => apiGet<UsageSummaryDto>("/api/v1/billing/usage"),
  });

  const trialCountdown = useMemo(() => {
    const end = subQuery.data?.trialEndsAt;
    if (!end) return null;
    const ms = new Date(end).getTime() - Date.now();
    if (ms <= 0) return t("admin.billing.trialEnded", "Trial ended");
    const days = Math.ceil(ms / 86_400_000);
    return t("admin.billing.trialDaysLeft", "{{count}} day(s) left in trial", { count: days });
  }, [subQuery.data?.trialEndsAt, t]);

  const previewMut = useMutation({
    mutationFn: () =>
      apiPost<typeof planPreview>("/api/v1/billing/subscription/preview-change", {
        planKey,
        interval,
        seats: Number(seats),
      }),
    onSuccess: (data) => {
      setPlanPreview(data);
      toast.message(t("admin.billing.previewReady"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeMut = useMutation({
    mutationFn: (confirm: boolean) =>
      apiPost<{ applied?: boolean; preview?: unknown }>("/api/v1/billing/subscription/change-plan", {
        planKey,
        interval,
        seats: Number(seats),
        confirm,
      }),
    onSuccess: (data) => {
      if (data?.applied) {
        setPlanPreview(null);
        toast.success(t("admin.billing.planChanged", "Plan updated"));
        void qc.invalidateQueries({ queryKey: ["billing", "subscription"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => apiPost("/api/v1/billing/subscription/cancel", { atPeriodEnd: true }),
    onSuccess: () => {
      toast.success(t("admin.billing.cancelScheduled", "Cancellation scheduled for period end"));
      void qc.invalidateQueries({ queryKey: ["billing", "subscription"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sub = subQuery.data;
  const planLabel =
    sub && i18n.language.startsWith("ar") ? sub.plan.nameAr || sub.plan.nameEn : sub?.plan.nameEn;

  const wallet = walletQuery.data;
  const isLite = sub?.plan.key === "LITE";

  return (
  <div className="space-y-4">
    {isLite ? <AdminLiteKiorexFeesCard /> : <AdminKiorexFreeProgressCard />}
    <AdminReferralInviteCard />
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.title", "Plan & billing")}</CardTitle>
        <CardDescription>
          {t("admin.billing.hint", "Your organization's Kiorly subscription, trial, and seat count.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : sub ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{planLabel}</span>
              <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>{sub.status}</Badge>
              {sub.cancelAtPeriodEnd ? (
                <Badge variant="outline">{t("admin.billing.cancelsAtPeriodEnd", "Cancels at period end")}</Badge>
              ) : null}
            </div>
            {trialCountdown ? <p className="text-sm text-muted-foreground">{trialCountdown}</p> : null}
            <p className="text-sm text-muted-foreground">
              {t("admin.billing.seats", "Clinician seats")}: {sub.clinicianSeats} · {sub.interval}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("admin.billing.periodEnd", "Current period ends")}: {new Date(sub.currentPeriodEnd).toLocaleString()}
            </p>
            {isLite ? (
              <p className="text-sm">{t("admin.billing.kiorex.liteFees.noSubscription")}</p>
            ) : sub.nextInvoicePreview ? (
              <p className="text-sm">
                {t("admin.billing.nextInvoice", "Next invoice preview")}: {sub.nextInvoicePreview.subtotal}{" "}
                {sub.nextInvoicePreview.currency} — {sub.nextInvoicePreview.description}
              </p>
            ) : null}
            {canManage ? (
              <div className="space-y-3 rounded border border-border p-3">
                <p className="text-sm font-medium">{t("admin.billing.comparePlans")}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <PlanKeySelect planKey={planKey} setPlanKey={setPlanKey} />
                  <div className="space-y-1">
                    <Label>{t("admin.billing.interval", "Interval")}</Label>
                    <select className={nativeSelectClassName} value={interval} onChange={(e) => setInterval(e.target.value)}>
                      <option value="MONTHLY">{t("platform.plans.monthly", "Monthly")}</option>
                      <option value="ANNUAL">{t("platform.plans.annual", "Annual")}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("admin.billing.seats", "Clinician seats")}</Label>
                    <Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
                  </div>
                </div>
                {planPreview?.proration ? (
                  <div className="space-y-1 rounded-md bg-muted/50 p-2 text-sm">
                    <p>
                      {t("admin.billing.effectiveAt")}:{" "}
                      {planPreview.proration.timing === "PERIOD_END"
                        ? t("admin.billing.periodEndChange")
                        : new Date(planPreview.proration.effectiveAt).toLocaleString()}
                    </p>
                    {planPreview.proration.timing === "IMMEDIATE" ? (
                      <>
                        <p>
                          {t("admin.billing.prorationCredit")}: {planPreview.proration.credit}{" "}
                          {planPreview.proration.currency}
                        </p>
                        <p>
                          {t("admin.billing.prorationCharge")}: {planPreview.proration.charge}{" "}
                          {planPreview.proration.currency}
                        </p>
                        <p className="font-medium">
                          {t("admin.billing.prorationDue")}: {planPreview.proration.netDue}{" "}
                          {planPreview.proration.currency}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={previewMut.isPending} onClick={() => previewMut.mutate()}>
                    {t("admin.billing.preview", "Preview")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={changeMut.isPending || !planPreview}
                    onClick={() => changeMut.mutate(true)}
                  >
                    {t("admin.billing.confirmChange", "Confirm change")}
                  </Button>
                  {!sub.cancelAtPeriodEnd && sub.status !== "CANCELLED" ? (
                    <Button type="button" size="sm" variant="destructive" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                      {t("admin.billing.cancel", "Cancel at period end")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.billing.none", "No subscription on file.")}</p>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.usage.title", "Monthly usage")}</CardTitle>
        <CardDescription>{t("admin.billing.usage.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {usageQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : usageQuery.data ? (
          <>
            {usageQuery.data.whatsappPaused ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">{t("admin.billing.usage.whatsappPaused")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    showPaywall(
                      { code: PLAN_UPGRADE_REQUIRED, entitlement: "whatsapp_reminders", requiredPlan: "PRO" },
                      "usage-whatsapp-quota",
                    )
                  }
                >
                  {t("paywall.upgradeFromQuota", "Upgrade plan")}
                </Button>
              </div>
            ) : null}
            <ul className="space-y-2 text-sm">
              {usageQuery.data.metrics
                .filter((m) => ["WHATSAPP_MESSAGES", "AI_ASSISTANT_REQUESTS"].includes(m.metric))
                .map((m) => (
                  <li key={m.metric} className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span>{t(`admin.billing.usage.metric.${m.metric}`, m.metric)}</span>
                      <span className={m.atLimit ? "text-destructive font-medium" : m.nearLimit ? "text-amber-700" : ""}>
                        {m.quantity} / {m.limit}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${m.atLimit ? "bg-destructive" : m.nearLimit ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, m.percent)}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("admin.billing.usage.period", { period: usageQuery.data.periodKey })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.billing.usage.loadError")}</p>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.wallet.title", "Credit wallet")}</CardTitle>
        <CardDescription>{t("admin.billing.wallet.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {walletQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : walletQuery.isError ? (
          <p className="text-sm text-destructive">{t("admin.billing.wallet.loadError")}</p>
        ) : wallet ? (
          <>
            <p className="text-lg font-semibold">
              {t("admin.billing.wallet.balance")}: {wallet.balance} {wallet.currency}
            </p>
            {wallet.upcomingExpiries.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("admin.billing.wallet.upcomingExpiries")}</p>
                <ul className="text-sm text-muted-foreground">
                  {wallet.upcomingExpiries.map((row) => (
                    <li key={row.entryId}>
                      {row.amount} {wallet.currency} —{" "}
                      {t("admin.billing.wallet.expiresOn", {
                        date: new Date(row.expiresAt).toLocaleDateString(),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("admin.billing.wallet.ledger")}</p>
              {wallet.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.billing.wallet.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.billing.wallet.date")}</TableHead>
                      <TableHead>{t("admin.billing.wallet.type")}</TableHead>
                      <TableHead>{t("admin.billing.wallet.reason")}</TableHead>
                      <TableHead className="text-end">{t("admin.billing.wallet.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.entries.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{row.type}</TableCell>
                        <TableCell className="text-xs">{row.reason}</TableCell>
                        <TableCell className="text-end text-xs font-mono">
                          {row.amount} {wallet.currency}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
    </div>
  );
}

function PlanKeySelect({ planKey, setPlanKey }: { planKey: string; setPlanKey: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Label>{t("admin.billing.plan", "Plan")}</Label>
      <select className={nativeSelectClassName} value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
        {["LITE", "PRO", "CLINIC", "ENTERPRISE"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}