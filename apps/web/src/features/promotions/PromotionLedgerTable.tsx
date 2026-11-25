import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { usePromotionLedger } from "./promotions-api";
import { minorToUnits } from "./promotions-logic";

/** The append-only budget ledger of one promotion. Booking references are opaque ids; there is no patient column. */
export function PromotionLedgerTable({ id }: { id: string }) {
  const { t, i18n } = useTranslation(); const locale = localeForLanguage(i18n.language); const [page, setPage] = useState(1);
  const q = usePromotionLedger(id, page); const rows = q.data?.rows ?? [];
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("promotions.loading")}</p>;
  if (q.isError) return <p role="alert" className="text-sm">{t("promotions.loadError")}</p>;
  return (
    <div className="space-y-2" data-testid={`promo-ledger-${id}`}>
      <p className="text-xs text-muted-foreground">{t("promotions.ledgerHint")}</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("promotions.ledgerEmpty")}</p> : (
        <div role="region" aria-label={t("promotions.ledger")} tabIndex={0} className="overflow-x-auto rounded-lg">
          <table className="w-full text-sm"><thead><tr>{["colDate", "colType", "colAmount", "colBooking"].map((c) => <th key={c} scope="col" className="h-10 whitespace-nowrap px-3 text-start font-medium text-muted-foreground">{t(`promotions.${c}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r) => {
              const sign = r.type === "RESERVE" || r.type === "DEBIT" ? "-" : "+";
              return <tr key={r.id}><td className="border-t p-3">{new Date(r.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</td><td className="border-t p-3">{t(`promotions.entryType.${r.type}`)}</td><td className="ltr-nums border-t p-3">{sign}{formatMoneyAmount(minorToUnits(r.amountMinor), r.currency, locale)}</td><td className="border-t p-3 font-mono text-xs" dir="ltr">{r.bookingRef ? r.bookingRef.slice(-8) : "—"}</td></tr>;
            })}</tbody></table>
        </div>
      )}
      {q.data && q.data.total > q.data.pageSize ? (
        <div className="flex items-center justify-between"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="‹">‹</Button><span className="ltr-nums text-xs text-muted-foreground">{page} / {Math.ceil(q.data.total / q.data.pageSize)}</span><Button size="sm" variant="outline" disabled={page * q.data.pageSize >= q.data.total} onClick={() => setPage(page + 1)} aria-label="›">›</Button></div>
      ) : null}
    </div>
  );
}
