import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntitlement } from "@/hooks/use-entitlement";
import { apiGet } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { sanitizeReportingRange } from "@/lib/reporting-range";
import { useDateRangeStore } from "@/stores/date-range-store";

type AgingRow = {
  payerNameEn: string;
  payerNameAr: string;
  currency: string;
  buckets: { b0_30: number; b31_60: number; b61_90: number; b90_plus: number };
  total: number;
};
type AgingDto = { rows: AgingRow[]; grandTotal: number; reconcilesWithClaimLines: boolean };
type BranchDto = {
  branches: { clinicId: string; nameEn: string; nameAr: string; currency: string; revenue: number; expenses: number; netProfit: number }[];
  totals: { revenue: number; expenses: number; netProfit: number };
  reconcilesWithBilling: boolean;
};
type PayoutsDto = {
  totals: { kiorex: number; doctor: number; combined: number };
  kiorexPayouts: { payoutRef: string; amount: number; currency: string; paidAt: string | null }[];
  doctorPayouts: { periodKey: string; amount: number; currency: string; paidAt: string | null }[];
};

/** RP-04 — AR aging, payouts, branch P&L. */
export function Rp04FinanceReportsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const entitled = useEntitlement("mod_reports");
  const from = useDateRangeStore((s) => s.from);
  const to = useDateRangeStore((s) => s.to);
  const range = sanitizeReportingRange(from, to);
  const money = (n: number, c: string) => formatMoneyAmount(n, c, locale);

  const aging = useQuery({
    queryKey: ["reports", "ar-aging"],
    queryFn: () => apiGet<AgingDto>("/api/v1/reports/ar-aging"),
    enabled: entitled,
    retry: false,
  });
  const branch = useQuery({
    queryKey: ["reports", "branch-pl", range.from, range.to],
    queryFn: () => apiGet<BranchDto>(`/api/v1/reports/branch-pl?from=${range.from}&to=${range.to}`),
    enabled: entitled,
    retry: false,
  });
  const payouts = useQuery({
    queryKey: ["reports", "payouts", range.from, range.to],
    queryFn: () => apiGet<PayoutsDto>(`/api/v1/reports/payouts?from=${range.from}&to=${range.to}`),
    enabled: entitled,
    retry: false,
  });

  if (!entitled) {
    return <p className="p-6 text-sm text-muted-foreground">{t("rp04.denied")}</p>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6" data-testid="rp04-finance-reports">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("rp04.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("rp04.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("rp04.arAging")}</CardTitle>
          <CardDescription>
            {t("rp04.arAgingHint")}{" "}
            {aging.data ? (
              <Badge variant={aging.data.reconcilesWithClaimLines ? "secondary" : "muted"}>
                {aging.data.reconcilesWithClaimLines ? t("rp04.reconciled") : t("rp04.mismatch")}
              </Badge>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">{t("rp04.payer")}</th>
                  <th className="p-2 text-start">0–30</th>
                  <th className="p-2 text-start">31–60</th>
                  <th className="p-2 text-start">61–90</th>
                  <th className="p-2 text-start">90+</th>
                  <th className="p-2 text-start">{t("rp04.total")}</th>
                </tr>
              </thead>
              <tbody>
                {(aging.data?.rows ?? []).map((r) => (
                  <tr key={`${r.payerNameEn}-${r.currency}`} className="border-t">
                    <td className="p-2">{i18n.language.startsWith("ar") && r.payerNameAr ? r.payerNameAr : r.payerNameEn}</td>
                    <td className="p-2 ltr-nums">{money(r.buckets.b0_30, r.currency)}</td>
                    <td className="p-2 ltr-nums">{money(r.buckets.b31_60, r.currency)}</td>
                    <td className="p-2 ltr-nums">{money(r.buckets.b61_90, r.currency)}</td>
                    <td className="p-2 ltr-nums">{money(r.buckets.b90_plus, r.currency)}</td>
                    <td className="p-2 ltr-nums font-medium">{money(r.total, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rp04.branchPl")}</CardTitle>
          <CardDescription>
            {t("rp04.branchPlHint")}{" "}
            {branch.data ? (
              <Badge variant={branch.data.reconcilesWithBilling ? "secondary" : "muted"}>
                {branch.data.reconcilesWithBilling ? t("rp04.reconciled") : t("rp04.mismatch")}
              </Badge>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">{t("rp04.branch")}</th>
                  <th className="p-2 text-start">{t("rp04.revenue")}</th>
                  <th className="p-2 text-start">{t("rp04.expenses")}</th>
                  <th className="p-2 text-start">{t("rp04.net")}</th>
                </tr>
              </thead>
              <tbody>
                {(branch.data?.branches ?? []).map((b) => (
                  <tr key={b.clinicId} className="border-t">
                    <td className="p-2">{i18n.language.startsWith("ar") && b.nameAr ? b.nameAr : b.nameEn}</td>
                    <td className="p-2 ltr-nums">{money(b.revenue, b.currency)}</td>
                    <td className="p-2 ltr-nums">{money(b.expenses, b.currency)}</td>
                    <td className="p-2 ltr-nums font-medium">{money(b.netProfit, b.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rp04.payouts")}</CardTitle>
          <CardDescription>
            {t("rp04.payoutsHint")}{" "}
            {payouts.data ? (
              <span className="ltr-nums">
                {t("rp04.payoutsTotal")}: {money(payouts.data.totals.combined, "EGP")}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Kiorex: {payouts.data?.kiorexPayouts.length ?? 0} · {t("rp04.doctor")}:{" "}
            {payouts.data?.doctorPayouts.length ?? 0}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
