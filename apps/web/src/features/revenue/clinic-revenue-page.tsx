import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClinicRevenueBreakdownQuery, useRevenueQuery } from "@/lib/api-hooks";
import { useDateRangeStore } from "@/stores/date-range-store";

export function ClinicRevenuePage() {
  const { t, i18n } = useTranslation();
  const { from, to } = useDateRangeStore();
  const bd = useClinicRevenueBreakdownQuery();
  const [open, setOpen] = useState(false);
  const [selClinicId, setSelClinicId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const rev = useRevenueQuery({
    from,
    to,
    clinicId: selClinicId ?? undefined,
    page,
    pageSize,
    sortBy: "postedAt",
    sortOrder: "desc",
    enabled: open && Boolean(selClinicId),
  });

  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", {
      style: "currency",
      currency: "AED",
      maximumFractionDigits: 2,
    }).format(n);

  const rows = bd.data?.items ?? [];

  const detailRows = useMemo(() => rev.data?.items ?? [], [rev.data?.items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.clinicRevenue")}</h1>
        <p className="text-muted-foreground">{t("clinicRevenue.subtitle", "Posted encounter revenue by clinic for the reporting period.")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("clinicRevenue.totals", "Organization totals")}</CardTitle>
          <CardDescription className="ltr-nums">
            {t("clinicRevenue.grandGross", "Gross")}: {money(bd.data?.grandGross ?? 0)} · {t("clinicRevenue.grandNet", "Net")}:{" "}
            {money(bd.data?.grandNet ?? 0)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bd.isError ? (
            <p className="text-sm text-destructive">{bd.error instanceof Error ? bd.error.message : t("common.error")}</p>
          ) : bd.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-start">
                    <th className="px-3 py-2 font-medium">{t("clinicRevenue.clinic", "Clinic")}</th>
                    <th className="px-3 py-2 font-medium">{t("clinicRevenue.gross", "Gross")}</th>
                    <th className="px-3 py-2 font-medium">{t("clinicRevenue.net", "Net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.clinicId}
                      className="cursor-pointer border-t border-border hover:bg-muted/50"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelClinicId(r.clinicId);
                          setPage(1);
                          setOpen(true);
                        }
                      }}
                      onClick={() => {
                        setSelClinicId(r.clinicId);
                        setPage(1);
                        setOpen(true);
                      }}
                    >
                      <td className="px-3 py-2 font-medium">{i18n.language === "ar" ? r.nameAr || r.nameEn : r.nameEn}</td>
                      <td className="px-3 py-2 ltr-nums text-muted-foreground">{money(r.grossTotal)}</td>
                      <td className="px-3 py-2 ltr-nums">{money(r.netTotal)}</td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        {t("clinicRevenue.noData", "No posted revenue in this range.")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("clinicRevenue.breakdownTitle", "Revenue lines")}</DialogTitle>
          </DialogHeader>
          {selClinicId ? (
            <div className="space-y-3 text-sm">
              {rev.isPending ? <p className="text-muted-foreground">{t("common.loading")}</p> : null}
              {rev.isError ? (
                <p className="text-destructive">{rev.error instanceof Error ? rev.error.message : t("common.error")}</p>
              ) : null}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {detailRows.map((e) => (
                  <div key={e.id} className="rounded-md border border-border px-2 py-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary">{e.category}</Badge>
                      <span className="ltr-nums font-medium">{money(e.netAmount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{e.description ?? "—"}</p>
                    <p className="text-xs text-muted-foreground ltr-nums">{new Date(e.postedAt).toLocaleString()}</p>
                  </div>
                ))}
                {!rev.isPending && !detailRows.length ? (
                  <p className="text-muted-foreground">{t("clinicRevenue.noLines", "No lines in this range.")}</p>
                ) : null}
              </div>
              {rev.data && rev.data.total > pageSize ? (
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  total={rev.data.total}
                  totalPages={rev.data.totalPages}
                  disabled={rev.isPending}
                  onPageChange={setPage}
                  onPageSizeChange={() => undefined}
                />
              ) : null}
            </div>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t("common.close", "Close")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
