import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { fetchPublicLink } from "./pay-api";
import "./pay-i18n";

/** Public page behind a Kiorly Pay link (patient side): the amount, who it is for, how to pay and the reference to write; its state (waiting, paid, expired, cancelled). Read only: the payment itself, recorded by the clinic or matched from the bank file, consumes the link. */
export function PayLinkPublicPage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const locale = localeForLanguage(i18n.language);
  const q = useQuery({ queryKey: ["pay-link", token], enabled: Boolean(token), queryFn: () => fetchPublicLink(token!), retry: false });
  if (q.isPending) return <p className="p-8 text-center text-sm text-muted-foreground">{t("pay.loading")}</p>;
  if (q.isError || !q.data) return <div className="mx-auto max-w-lg p-8 text-center" data-testid="pay-link-not-found"><p className="text-lg font-medium">{t("pay.pub.notFound")}</p></div>;
  const d = q.data;
  const clinic = isAr ? d.clinicNameAr || d.clinicNameEn : d.clinicNameEn;
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-8" data-testid="pay-link-page" data-status={d.status}>
      <Card>
        <CardHeader><CardTitle className="text-xl">{clinic || t("pay.pub.title")}</CardTitle><p className="text-sm text-muted-foreground">{t("pay.pub.title")}</p></CardHeader>
        <CardContent className="space-y-4">
          <div><p className="text-sm text-muted-foreground">{t("pay.pub.amount")}</p><p className="text-3xl font-semibold ltr-nums" data-testid="pay-link-amount">{formatMoneyAmount(d.amount, d.currency, locale)}</p></div>
          <p className="text-sm font-medium" role="status" data-testid="pay-link-status">{t(`pay.pub.status.${d.status}`)}</p>
          {d.status === "ACTIVE" ? (
            <>
              {d.reference ? <div><p className="text-sm text-muted-foreground">{t("pay.pub.reference")}</p><p className="text-lg font-semibold ltr-nums" data-testid="pay-link-reference">{d.reference}</p></div> : null}
              <p className="text-sm">{t("pay.pub.expires")} <span className="font-medium ltr-nums">{new Date(d.expiresAt).toLocaleString(locale)}</span></p>
              {d.channels.length ? (
                <div className="space-y-2"><p className="text-sm font-medium">{t("pay.pub.howTo")}</p>
                  <ul className="space-y-2">{d.channels.map((c, i) => <li key={i} className="rounded-lg border p-3 text-sm"><span className="font-medium">{c.name}</span>{c.mobileNumber ? <span className="block ltr-nums" dir="ltr">{c.mobileNumber}</span> : null}{c.accountNumber ? <span className="block ltr-nums" dir="ltr">{c.accountNumber}</span> : null}</li>)}</ul></div>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("pay.pub.amountLocked")}</p>
            </>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("pay.principle")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
