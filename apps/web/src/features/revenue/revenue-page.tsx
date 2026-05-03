import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery, useRevenueQuery, useRevenueTotalsQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";
import { defaultMonthRange } from "@/stores/date-range-store";

/** VISIT_FEE = encounter consultation; APPOINTMENT_FEE = legacy rows only (fees no longer booked on appointments). */
const REV_CATEGORIES = ["VISIT", "VISIT_FEE", "PROCEDURE", "LAB", "PHARMACY", "IMAGING", "APPOINTMENT_FEE", "OTHER"] as const;

export function RevenuePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const initialRange = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [filterClinicId, setFilterClinicId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("postedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const revParams = useMemo(
    () => ({
      from,
      to,
      clinicId: filterClinicId || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [from, to, filterClinicId, page, pageSize, sortBy, sortOrder]
  );

  const { data: revData, isPending, isError, error } = useRevenueQuery(revParams);
  const rows = revData?.items ?? [];
  const revTotal = revData?.total ?? 0;
  const revTotalPages = revData?.totalPages ?? 1;
  const totalsQ = useRevenueTotalsQuery({ from, to, clinicId: filterClinicId || undefined });
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  const [category, setCategory] = useState("VISIT");
  const [gross, setGross] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [rfCategory, setRfCategory] = useState("");
  const [rfNet, setRfNet] = useState("");
  const [rfPosted, setRfPosted] = useState("");
  const [rfStatus, setRfStatus] = useState("");

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<unknown>("/api/v1/revenue", {
        clinicId,
        category,
        description: `Manual entry ${new Date().toISOString().slice(0, 10)}`,
        grossAmount: grossN,
        taxAmount: taxComputed,
        netAmount: netComputed,
        currency: "AED",
        postedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      setGross("");
      setVatPercent("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", { style: "currency", currency: "AED" }).format(n);

  const grossN = Number.parseFloat(gross || "0");
  const vatN = Number.parseFloat(vatPercent || "0");
  const vatClamped = Number.isFinite(vatN) ? Math.min(100, Math.max(0, vatN)) : 0;
  const taxComputed = Math.round(grossN * (vatClamped / 100) * 100) / 100;
  const netComputed = Math.round((grossN - taxComputed) * 100) / 100;

  const filteredRevenueRows = useMemo(() => {
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    const fmt = (x: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "AED" }).format(x);
    const n = (s: string) => s.trim().toLowerCase();
    const fc = n(rfCategory);
    const fn = rfNet.trim();
    const fp = n(rfPosted);
    const fs = n(rfStatus);
    return rows.filter((r) => {
      if (fc && !r.category.toLowerCase().includes(fc)) return false;
      if (fn) {
        const hay = `${r.netAmount} ${fmt(r.netAmount)}`.toLowerCase();
        if (!hay.includes(fn.toLowerCase())) return false;
      }
      if (fp) {
        const ds = new Date(r.postedAt).toLocaleString(loc).toLowerCase();
        if (!ds.includes(fp) && !r.postedAt.toLowerCase().includes(fp)) return false;
      }
      if (fs && !r.status.toLowerCase().includes(fs)) return false;
      return true;
    });
  }, [rows, rfCategory, rfNet, rfPosted, rfStatus, i18n.language]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("revenue.title")}</h1>
        <p className="text-muted-foreground">{t("revenue.subtitle")}</p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem] lg:items-stretch">
        <Card className="lg:max-w-md">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium">{t("revenue.searchFilters", "Search ledger")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.usingRange", "From")}</Label>
              <Input className="h-9 ltr-nums" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("common.to", "To")}</Label>
              <Input className="h-9 ltr-nums" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
            <div className="min-w-[9rem] flex-1 space-y-1.5">
              <Label className="text-xs">{t("revenue.clinic")}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={filterClinicId}
                onChange={(e) => {
                  setFilterClinicId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("revenue.allClinics", "All clinics")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => { const r = defaultMonthRange(); setFrom(r.from); setTo(r.to); setPage(1); }}>
              {t("revenue.thisMonth", "This month")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("revenue.totalGross", "Total gross")}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <p className="text-sm font-semibold ltr-nums sm:text-base">{totalsQ.isPending ? "—" : money(totalsQ.data?.grossTotal ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("revenue.totalNet", "Total net")}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <p className="text-sm font-semibold ltr-nums sm:text-base">{totalsQ.isPending ? "—" : money(totalsQ.data?.netTotal ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("revenue.post")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-2">
            <Label>{t("revenue.clinic")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              <option value="">{t("revenue.pickClinic")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.category")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {REV_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.gross")}</Label>
            <Input className="ltr-nums" value={gross} onChange={(e) => setGross(e.target.value)} type="number" min="0" step="0.01" />
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.vatPercent", "VAT %")}</Label>
            <Input
              className="ltr-nums"
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.net")}</Label>
            <Input className="ltr-nums bg-muted/50" readOnly value={gross.trim() ? money(netComputed) : ""} type="text" />
          </div>
          <div className="flex items-end">
            <Button type="button" disabled={!clinicId || !gross || createMut.isPending} onClick={() => createMut.mutate()}>
              {t("revenue.submit")}
            </Button>
          </div>
          {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("revenue.ledger")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!rfCategory.trim() && !rfNet.trim() && !rfPosted.trim() && !rfStatus.trim()}
            onClick={() => {
              setRfCategory("");
              setRfNet("");
              setRfPosted("");
              setRfStatus("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <SortableTh
                    label={t("revenue.category")}
                    column="category"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={rfCategory}
                    onFilterChange={setRfCategory}
                  />
                  <SortableTh
                    label={t("revenue.net")}
                    column="netAmount"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={rfNet}
                    onFilterChange={setRfNet}
                  />
                  <SortableTh
                    label={t("revenue.posted")}
                    column="postedAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={rfPosted}
                    onFilterChange={setRfPosted}
                  />
                  <SortableTh
                    label={t("revenue.status", "Status")}
                    column="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={rfStatus}
                    onFilterChange={setRfStatus}
                  />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : null}
                {!isPending &&
                  filteredRevenueRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">{r.category}</td>
                      <td className="px-3 py-2 ltr-nums">{money(r.netAmount)}</td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(r.postedAt).toLocaleString(i18n.language === "ar" ? "ar-AE" : "en-AE")}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.status}</td>
                    </tr>
                  ))}
                {!isPending && rows.length > 0 && filteredRevenueRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.noColMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={revTotal}
            totalPages={revTotalPages}
            disabled={isPending}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
