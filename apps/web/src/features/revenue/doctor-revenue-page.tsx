import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TablePagination } from "@/components/table-pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRevenueQuery, useRevenueTotalsQuery } from "@/lib/api-hooks";
import type { RevenueEntryDto } from "@/lib/api-types";
import { useDateRangeStore } from "@/stores/date-range-store";

export function DoctorRevenuePage() {
  const { t, i18n } = useTranslation();
  const { from, to } = useDateRangeStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totals = useRevenueTotalsQuery({ from, to });
  const list = useRevenueQuery({ from, to, page, pageSize, sortBy: "postedAt", sortOrder: "desc" });

  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", {
      style: "currency",
      currency: "AED",
      maximumFractionDigits: 2,
    }).format(n);

  const rows: RevenueEntryDto[] = useMemo(() => list.data?.items ?? [], [list.data?.items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.doctorRevenue")}</h1>
        <p className="text-muted-foreground">
          {t("doctorRevenue.subtitle", "Revenue from completed encounters and other ledger rows tied to you (not appointments).")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("doctorRevenue.gross", "Gross (period)")}</CardTitle>
            <CardDescription className="ltr-nums text-2xl font-semibold">
              {totals.isPending ? "…" : money(totals.data?.grossTotal ?? 0)}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("doctorRevenue.net", "Net (period)")}</CardTitle>
            <CardDescription className="ltr-nums text-2xl font-semibold">
              {totals.isPending ? "…" : money(totals.data?.netTotal ?? 0)}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("doctorRevenue.lines", "Revenue lines")}</CardTitle>
          <CardDescription>{t("doctorRevenue.linesHint", "Only entries linked to encounters where you are the attending doctor.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {list.isError ? (
            <p className="text-sm text-destructive">{list.error instanceof Error ? list.error.message : t("common.error")}</p>
          ) : null}
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("revenue.category")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("revenue.net", "Net")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("revenue.posted")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 ltr-nums">{money(r.netAmount)}</td>
                    <td className="px-3 py-2 text-muted-foreground ltr-nums">{new Date(r.postedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!list.isPending && !rows.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      {t("doctorRevenue.empty", "No revenue lines in this period.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={list.data.total}
              totalPages={list.data.totalPages}
              disabled={list.isPending}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
