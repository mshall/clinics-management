import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/api-url";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

type StatementListItem = {
  periodKey: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  total: string;
  amountDue: string;
  issuedAt: string | null;
};

type MonthlyStatement = {
  periodKey: string;
  currency: string;
  preview: boolean;
  invoice: { number: string; status: string } | null;
  subscription: { subscription: string; seats: string; addons: string; usage: string; total: string };
  kiorexPatients: { chargeId: string; attendedAt: string; doctorName: string; patientInitials: string; fee: string }[];
  kiorexPatientCount: number;
  commissionTotal: string;
  carryForwardIn: string;
  offset: string;
  prepaid: string;
  otherAdjustments: string;
  subtotal: string;
  creditsUsed: string;
  walletBalance: string;
  netPayable: string;
  vatRatePercent: number;
  vat: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  payments: { id: string; createdAt: string; provider: string; amount: string; currency: string; status: string }[];
  explanationEn: string | null;
  explanationAr: string | null;
  reconciles: boolean;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "muted"> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PAID: "default",
  PARTIALLY_PAID: "muted",
  VOID: "outline",
  UNCOLLECTIBLE: "muted",
};

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums" dir="ltr">
        {value}
      </span>
    </div>
  );
}

export function AdminKiorlyStatementsPanel() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<string | null>(null);
  const isAr = i18n.language.startsWith("ar");

  const listQuery = useQuery({
    queryKey: ["billing", "statements"],
    queryFn: () => apiGet<{ items: StatementListItem[] }>("/api/v1/billing/statements"),
  });

  const detailQuery = useQuery({
    queryKey: ["billing", "statements", period],
    enabled: Boolean(period),
    queryFn: () => apiGet<MonthlyStatement>(`/api/v1/billing/statements/${period}`),
  });

  async function openPdf(periodKey: string) {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(apiUrl(`/api/v1/billing/statements/${periodKey}?format=pdf`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.error(t("admin.billing.statements.pdfError"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const rows = listQuery.data?.items ?? [];
  const st = detailQuery.data;
  const money = (v: string) => `${v} ${st?.currency ?? ""}`.trim();
  const minus = (v: string) => (Number(v) > 0 ? `-${money(v)}` : money(v));

  return (
    <Card data-testid="kiorly-statements-panel">
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.statements.title")}</CardTitle>
        <CardDescription>{t("admin.billing.statements.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {listQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-destructive">{t("admin.billing.statements.loadError")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.billing.statements.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.billing.statements.period")}</TableHead>
                <TableHead>{t("admin.billing.statements.invoice")}</TableHead>
                <TableHead>{t("admin.billing.statements.status")}</TableHead>
                <TableHead className="text-end">{t("admin.billing.statements.total")}</TableHead>
                <TableHead><span className="sr-only">{t("common.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.invoiceId}>
                  <TableCell className="text-xs">{row.periodKey}</TableCell>
                  <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                      {t(`admin.billing.invoices.status_${row.status}`, row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end text-xs">
                    {row.total} {row.currency}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPeriod(row.periodKey)}>
                        {t("admin.billing.statements.view")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void openPdf(row.periodKey)}>
                        {t("admin.billing.statements.pdf")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={Boolean(period)} onOpenChange={(open) => !open && setPeriod(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.billing.statements.detailTitle", { period: period ?? "" })}</DialogTitle>
          </DialogHeader>
          {detailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : detailQuery.isError || !st ? (
            <p className="text-sm text-destructive">{t("admin.billing.statements.loadError")}</p>
          ) : (
            <div className="space-y-4" data-testid="kiorly-statement-detail">
              {st.preview ? <Badge variant="outline">{t("admin.billing.statements.preview")}</Badge> : null}
              {!st.reconciles ? (
                <p className="text-sm text-destructive">{t("admin.billing.statements.mismatch")}</p>
              ) : null}
              {(isAr ? st.explanationAr : st.explanationEn) ? (
                <p className="text-sm leading-relaxed">{isAr ? st.explanationAr : st.explanationEn}</p>
              ) : null}

              <div className="space-y-1">
                <Row label={t("admin.billing.statements.subscription")} value={money(st.subscription.subscription)} />
                {Number(st.subscription.seats) !== 0 ? (
                  <Row label={t("admin.billing.statements.seats")} value={money(st.subscription.seats)} />
                ) : null}
                {Number(st.subscription.addons) !== 0 ? (
                  <Row label={t("admin.billing.statements.addons")} value={money(st.subscription.addons)} />
                ) : null}
                {Number(st.subscription.usage) !== 0 ? (
                  <Row label={t("admin.billing.statements.usage")} value={money(st.subscription.usage)} />
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("admin.billing.statements.patients", { count: st.kiorexPatientCount })}
                </p>
                {st.kiorexPatients.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("admin.billing.statements.noPatients")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.billing.statements.date")}</TableHead>
                        <TableHead>{t("admin.billing.statements.doctor")}</TableHead>
                        <TableHead>{t("admin.billing.statements.patient")}</TableHead>
                        <TableHead className="text-end">{t("admin.billing.statements.fee")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {st.kiorexPatients.map((p) => (
                        <TableRow key={p.chargeId}>
                          <TableCell className="text-xs">
                            {new Date(p.attendedAt).toLocaleDateString(i18n.language)}
                          </TableCell>
                          <TableCell className="text-xs">{p.doctorName}</TableCell>
                          <TableCell className="font-mono text-xs">{p.patientInitials}</TableCell>
                          <TableCell className="text-end text-xs" dir="ltr">
                            {money(p.fee)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Row label={t("admin.billing.statements.commissionTotal")} value={money(st.commissionTotal)} strong />
                {Number(st.carryForwardIn) !== 0 ? (
                  <Row label={t("admin.billing.statements.carryIn")} value={money(st.carryForwardIn)} />
                ) : null}
              </div>

              <div className="space-y-1 border-t pt-3">
                <Row label={t("admin.billing.statements.offset")} value={minus(st.offset)} />
                {Number(st.prepaid) !== 0 ? (
                  <Row label={t("admin.billing.statements.prepaid")} value={minus(st.prepaid)} />
                ) : null}
                {Number(st.otherAdjustments) !== 0 ? (
                  <Row label={t("admin.billing.statements.other")} value={money(st.otherAdjustments)} />
                ) : null}
                <Row label={t("admin.billing.statements.subtotal")} value={money(st.subtotal)} />
                <Row label={t("admin.billing.statements.credits")} value={minus(st.creditsUsed)} />
                <Row label={t("admin.billing.statements.wallet")} value={money(st.walletBalance)} />
                <Row label={t("admin.billing.statements.netPayable")} value={money(st.netPayable)} />
                <Row label={t("admin.billing.statements.vat", { rate: st.vatRatePercent })} value={money(st.vat)} />
                <Row label={t("admin.billing.statements.totalLabel")} value={money(st.total)} strong />
              </div>

              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-medium">{t("admin.billing.statements.payments")}</p>
                {st.payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("admin.billing.statements.noPayments")}</p>
                ) : (
                  st.payments.map((pay) => (
                    <Row
                      key={pay.id}
                      label={`${new Date(pay.createdAt).toLocaleDateString(i18n.language)} · ${pay.provider} · ${pay.status}`}
                      value={`${pay.amount} ${pay.currency}`}
                    />
                  ))
                )}
                <Row label={t("admin.billing.statements.paid")} value={money(st.amountPaid)} />
                <Row label={t("admin.billing.statements.amountDue")} value={money(st.amountDue)} strong />
              </div>

              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => void openPdf(st.periodKey)}>
                  {t("admin.billing.statements.pdf")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
