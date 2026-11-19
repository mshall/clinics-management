import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";

type PayoutReport = {
  from: string;
  to: string;
  currency: string | null;
  totals: { collected: number; refunded: number; netDue: number; payoutsReceived: number; outstanding: number };
  deposits: {
    id: string;
    appointmentId: string | null;
    amount: number;
    currency: string;
    status: string;
    externalRef: string | null;
    payoutRef: string | null;
    createdAt: string;
  }[];
  payouts: { id: string; payoutRef: string; amount: number; currency: string; paidAt: string }[];
};

/** KX-07 — Kiorex Pay deposits collected on the clinic's behalf vs payouts received. */
export function KiorexPayoutsCard({ clinicId }: { clinicId: string }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const q = useQuery({
    queryKey: ["kiorex", "payouts", clinicId],
    queryFn: () => apiGet<PayoutReport>(`/api/v1/billing/kiorex-payouts?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId),
    retry: false,
  });
  if (q.isError) return null;
  const r = q.data;
  const money = (n: number) => formatMoneyAmount(n, r?.currency ?? "", locale);
  const tiles: { key: keyof PayoutReport["totals"]; label: string }[] = [
    { key: "collected", label: t("kiorexPayouts.collected", "Deposits collected") },
    { key: "refunded", label: t("kiorexPayouts.refunded", "Refunded to patients") },
    { key: "netDue", label: t("kiorexPayouts.netDue", "Due to clinic") },
    { key: "payoutsReceived", label: t("kiorexPayouts.payoutsReceived", "Payouts received") },
    { key: "outstanding", label: t("kiorexPayouts.outstanding", "Outstanding") },
  ];
  return (
    <Card data-testid="kiorex-payouts-card">
      <CardHeader>
        <CardTitle>{t("kiorexPayouts.title", "Kiorex Pay deposits & payouts")}</CardTitle>
        <CardDescription>
          {t(
            "kiorexPayouts.subtitle",
            "Deposits patients paid through Kiorex for your bookings, and what Kiorex has paid out to you (last 30 days).",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {r ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {tiles.map((tile) => (
                <div key={tile.key} className="rounded-md border px-3 py-2" data-testid={`kiorex-payouts-${tile.key}`}>
                  <p className="text-xs text-muted-foreground">{tile.label}</p>
                  <p className="text-lg font-semibold ltr-nums">{money(r.totals[tile.key])}</p>
                </div>
              ))}
            </div>
            {r.deposits.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("kiorexPayouts.empty", "No Kiorex Pay deposits in this period.")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start">{t("kiorexPayouts.colDate", "Date")}</th>
                    <th className="py-1 text-start">{t("kiorexPayouts.colBooking", "Booking")}</th>
                    <th className="py-1 text-start">{t("kiorexPayouts.colStatus", "Status")}</th>
                    <th className="py-1 text-start">{t("kiorexPayouts.colPayout", "Payout")}</th>
                    <th className="py-1 text-end">{t("kiorexPayouts.colAmount", "Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.deposits.map((d) => (
                    <tr key={d.id} className="border-t" data-testid="kiorex-payouts-row">
                      <td className="py-1 ltr-nums">{new Date(d.createdAt).toLocaleDateString(locale)}</td>
                      <td className="py-1 font-mono text-xs">{d.externalRef ?? "—"}</td>
                      <td className="py-1">{t(`depositBadge.status.${d.status}`, d.status)}</td>
                      <td className="py-1 font-mono text-xs">{d.payoutRef ?? t("kiorexPayouts.unpaid", "Not paid out yet")}</td>
                      <td className="py-1 text-end ltr-nums">{formatMoneyAmount(d.amount, d.currency, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
        )}
      </CardContent>
    </Card>
  );
}
