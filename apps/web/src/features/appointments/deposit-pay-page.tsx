import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";

type DepositLinkPage = {
  status: string;
  amount: number;
  currency: string;
  expiresAt: string | null;
  startsAt: string | null;
  timeZone: string;
  clinicNameEn: string;
  clinicNameAr: string;
  clinicPhone: string | null;
  channels: { channelKey: string; name: string; accountNumber: string | null; mobileNumber: string | null }[];
};

async function fetchLink(token: string): Promise<DepositLinkPage> {
  const res = await fetch(apiUrl(`/api/v1/public/deposit-links/${encodeURIComponent(token)}`));
  const body = (await res.json().catch(() => ({}))) as DepositLinkPage & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
  return body;
}

/** FS-04 — public page behind a clinic deposit link: amount, booking time and how to pay the clinic. */
export function DepositPayPage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const locale = localeForLanguage(i18n.language);
  const q = useQuery({ queryKey: ["deposit-link", token], enabled: Boolean(token), queryFn: () => fetchLink(token!), retry: false });

  if (q.isPending) return <p className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center" data-testid="deposit-pay-not-found">
        <p className="text-lg font-medium">{t("depositPay.notFound", "This payment link is not valid any more.")}</p>
      </div>
    );
  }
  const d = q.data;
  const clinicName = isAr ? d.clinicNameAr || d.clinicNameEn : d.clinicNameEn;
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { timeZone: d.timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const pending = d.status === "PENDING";

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-8" data-testid="deposit-pay-page" data-status={d.status}>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{clinicName}</CardTitle>
          {d.startsAt ? (
            <p className="text-sm text-muted-foreground">
              {t("depositPay.appointment", "Appointment")}: <span className="ltr-nums">{when(d.startsAt)}</span>
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("depositPay.amount", "Deposit to pay")}</p>
            <p className="text-3xl font-semibold ltr-nums" data-testid="deposit-pay-amount">
              {formatMoneyAmount(d.amount, d.currency, locale)}
            </p>
          </div>
          {pending ? (
            <>
              {d.expiresAt ? (
                <p className="text-sm">
                  {t("depositPay.payBy", "Please pay before")} <span className="ltr-nums font-medium">{when(d.expiresAt)}</span>
                </p>
              ) : null}
              {d.channels.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("depositPay.howToPay", "How to pay")}</p>
                  <ul className="space-y-2">
                    {d.channels.map((c) => (
                      <li key={c.channelKey} className="rounded-md border px-3 py-2 text-sm">
                        <p className="font-medium">{c.name}</p>
                        {c.mobileNumber ? <p className="ltr-nums">{c.mobileNumber}</p> : null}
                        {c.accountNumber ? <p className="ltr-nums">{c.accountNumber}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {t(
                  "depositPay.afterPaying",
                  "After paying, send the transaction reference to the clinic so they can confirm your booking.",
                )}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium" data-testid="deposit-pay-done">
              {d.status === "EXPIRED"
                ? t("depositPay.expired", "This payment link has expired. Please contact the clinic.")
                : t("depositPay.paid", "This deposit has been received. Thank you!")}
            </p>
          )}
          {d.clinicPhone ? (
            <a href={`tel:${d.clinicPhone}`} className="inline-flex items-center gap-2 text-sm text-primary">
              <Phone className="h-4 w-4" aria-hidden />
              <span className="ltr-nums">{d.clinicPhone}</span>
            </a>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
