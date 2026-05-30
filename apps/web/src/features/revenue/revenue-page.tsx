import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery, useClinicRevenueBreakdownQuery, usePayableOperationsQuery, useRevenueQuery, useRevenueTotalsQuery } from "@/lib/api-hooks";
import type { RevenueEntryDto } from "@/lib/api-types";
import { ApiError, apiPost } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";
import { useDateRangeStore } from "@/stores/date-range-store";
import { useAuthStore } from "@/stores/auth-store";

/** VISIT_FEE = encounter consultation; APPOINTMENT_FEE = legacy rows only (fees no longer booked on appointments). */
const REV_CATEGORIES = ["VISIT", "VISIT_FEE", "PROCEDURE", "LAB", "PHARMACY", "IMAGING", "APPOINTMENT_FEE", "OPERATION_PAYMENT", "OTHER"] as const;

function clinicDisplayName(r: RevenueEntryDto, lng: string): string {
  const en = r.clinicNameEn?.trim();
  const ar = r.clinicNameAr?.trim();
  if (lng === "ar") return ar || en || r.clinicId;
  return en || ar || r.clinicId;
}

export function RevenuePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { from, to, setRange, resetToCurrentMonth } = useDateRangeStore();
  const authUser = useAuthStore((s) => s.user);
  const breakdownEnabled =
    authUser?.role === "group_admin" || authUser?.role === "clinic_admin" || authUser?.role === "branch_manager";
  const bd = useClinicRevenueBreakdownQuery(breakdownEnabled);

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
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const [clinicId, setClinicId] = useState("");
  useEffect(() => {
    if (singleManagedClinic) {
      setFilterClinicId(singleManagedClinic.id);
      setClinicId(singleManagedClinic.id);
    }
  }, [singleManagedClinic?.id]);
  const [category, setCategory] = useState("VISIT");
  const [operationId, setOperationId] = useState("");
  const [gross, setGross] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [rfCategory, setRfCategory] = useState("");
  const [rfNet, setRfNet] = useState("");
  const [rfPosted, setRfPosted] = useState("");
  const [rfStatus, setRfStatus] = useState("");
  const [rfClinic, setRfClinic] = useState("");

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data: payableOps = [] } = usePayableOperationsQuery(clinicId || filterClinicId || undefined);
  const selectedOperation = useMemo(
    () => payableOps.find((o) => o.id === operationId) ?? null,
    [payableOps, operationId]
  );
  const operationBalance = selectedOperation?.balanceDue ?? 0;

  const createMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        clinicId: operationId && selectedOperation ? selectedOperation.clinicId : clinicId,
        category: operationId ? "OPERATION_PAYMENT" : category,
        description: operationId
          ? `Operation payment · ${selectedOperation?.patientName ?? selectedOperation?.patientMrn ?? operationId}`
          : `Manual entry ${new Date().toISOString().slice(0, 10)}`,
        grossAmount: grossN,
        taxAmount: taxComputed,
        netAmount: netComputed,
        currency: "AED",
        postedAt: new Date().toISOString(),
      };
      if (operationId) payload.operationId = operationId;
      return apiPost<unknown>("/api/v1/revenue", payload);
    },
    onSuccess: () => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["operations"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      setGross("");
      setVatPercent("");
      setOperationId("");
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

  const paymentExceedsBalance =
    operationId.length > 0 && netComputed > 0 && netComputed > operationBalance + 0.001;

  const filteredRevenueRows = useMemo(() => {
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    const fmt = (x: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "AED" }).format(x);
    return rows.filter((r) => {
      if (rfClinic.trim() && !columnFilterIncludes(clinicDisplayName(r, i18n.language), rfClinic)) return false;
      if (rfCategory.trim() && !columnFilterIncludes(r.category, rfCategory)) return false;
      if (rfNet.trim()) {
        const hay = `${r.netAmount} ${fmt(r.netAmount)}`;
        if (!columnFilterIncludes(hay, rfNet)) return false;
      }
      if (rfPosted.trim()) {
        const ds = new Date(r.postedAt).toLocaleString(loc);
        if (!columnFilterIncludes(ds, rfPosted) && !columnFilterIncludes(r.postedAt, rfPosted)) return false;
      }
      if (rfStatus.trim() && !columnFilterIncludes(r.status, rfStatus)) return false;
      return true;
    });
  }, [rows, rfCategory, rfNet, rfPosted, rfStatus, rfClinic, i18n.language]);

  const breakdownRows = bd.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("revenue.title")}</h1>
        <p className="text-muted-foreground">{t("revenue.subtitle")}</p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem] lg:items-stretch">
        <Card className="lg:max-w-xl">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium">{t("revenue.searchFilters", "Search ledger")}</CardTitle>
            <CardDescription className="text-xs">
              {t(
                "revenue.searchLedgerHint",
                "Pick a date range, then either all clinics in this organization or one clinic. Totals and the table follow this filter."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.usingRange", "From")}</Label>
              <Input
                className="h-9 ltr-nums"
                type="date"
                value={from}
                onChange={(e) => {
                  setRange(e.target.value, to);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("common.to", "To")}</Label>
              <Input
                className="h-9 ltr-nums"
                type="date"
                value={to}
                onChange={(e) => {
                  setRange(from, e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="min-w-[11rem] flex-1 space-y-1.5">
              <Label className="text-xs">{t("revenue.ledgerClinicFilter", "Clinic scope")}</Label>
              {singleManagedClinic ? (
                <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-2 text-sm">
                  {singleManagedClinic.nameEn}
                </p>
              ) : (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={filterClinicId}
                  onChange={(e) => {
                    setFilterClinicId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t("revenue.allClinicsOrganization", "All clinics (organization)")}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9"
              onClick={() => {
                resetToCurrentMonth();
                setPage(1);
                void qc.invalidateQueries();
              }}
            >
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

      {breakdownEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("revenue.byClinicTitle", "Posted revenue by clinic")}</CardTitle>
            <CardDescription className="ltr-nums">
              {t("revenue.byClinicSubtitle", "Same reporting period as above.")}{" "}
              {t("revenue.grandGross", "Gross")}: {money(bd.data?.grandGross ?? 0)} · {t("revenue.grandNet", "Net")}: {money(bd.data?.grandNet ?? 0)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bd.isError ? (
              <p className="text-sm text-destructive">{bd.error instanceof Error ? bd.error.message : t("common.error")}</p>
            ) : bd.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <ResponsiveTable>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("revenue.clinic")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("revenue.totalGross", "Gross")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("revenue.totalNet", "Net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownRows.map((r) => (
                      <tr key={r.clinicId} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{i18n.language === "ar" ? r.nameAr || r.nameEn : r.nameEn}</td>
                        <td className="px-3 py-2 ltr-nums text-muted-foreground">{money(r.grossTotal)}</td>
                        <td className="px-3 py-2 ltr-nums">{money(r.netTotal)}</td>
                      </tr>
                    ))}
                    {!breakdownRows.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                          {t("revenue.noBreakdownRows", "No posted revenue in this range.")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("revenue.post")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-2 sm:col-span-2 lg:col-span-6">
            <Label>{t("revenue.linkOperation", "Link to operation (optional)")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={operationId}
              onChange={(e) => {
                const id = e.target.value;
                setOperationId(id);
                if (id) {
                  const op = payableOps.find((o) => o.id === id);
                  if (op) {
                    setClinicId(op.clinicId);
                    const balance = op.balanceDue ?? 0;
                    setGross(String(balance));
                    setVatPercent("");
                  }
                }
              }}
            >
              <option value="">{t("revenue.noOperation", "No operation — general revenue")}</option>
              {payableOps.map((o) => {
                const patient = o.patientName?.trim() || o.patientMrn || o.patientId.slice(0, 8);
                const balance = o.balanceDue ?? o.totalCost - (o.paidAmount ?? 0);
                return (
                  <option key={o.id} value={o.id}>
                    {patient} · {new Date(o.operationDate).toLocaleDateString(i18n.language === "ar" ? "ar-AE" : "en-AE")} ·{" "}
                    {money(balance)} {t("operations.balanceDue", "Balance")}
                  </option>
                );
              })}
            </select>
            {selectedOperation ? (
              <p className="text-xs text-muted-foreground">
                {t("revenue.operationBalanceHint", { amount: money(operationBalance), defaultValue: "Remaining balance: {{amount}}" })}
                {" · "}
                {t("revenue.operationPaymentHint", "Payment amount will update the operation paid total.")}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.clinic")}</Label>
            {singleManagedClinic ? (
              <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {singleManagedClinic.nameEn}
              </p>
            ) : (
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
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("revenue.category")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={operationId ? "OPERATION_PAYMENT" : category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={operationId.length > 0}
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
            <CreateActionButton
              type="button"
              disabled={
                !(operationId ? selectedOperation?.clinicId : clinicId) ||
                !gross ||
                createMut.isPending ||
                paymentExceedsBalance
              }
              onClick={() => createMut.mutate()}
            >
              {t("revenue.submit")}
            </CreateActionButton>
          </div>
          {paymentExceedsBalance ? (
            <p className="text-sm text-destructive sm:col-span-full">
              {t("revenue.operationBalanceHint", { amount: money(operationBalance), defaultValue: "Remaining balance: {{amount}}" })}
            </p>
          ) : null}
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
            disabled={!rfCategory.trim() && !rfNet.trim() && !rfPosted.trim() && !rfStatus.trim() && !rfClinic.trim()}
            onClick={() => {
              setRfCategory("");
              setRfNet("");
              setRfPosted("");
              setRfStatus("");
              setRfClinic("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <FilterTh label={t("revenue.clinic")} value={rfClinic} onChange={setRfClinic} />
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
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : null}
                {!isPending &&
                  filteredRevenueRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="max-w-[14rem] truncate px-3 py-2 font-medium" title={clinicDisplayName(r, i18n.language)}>
                        {clinicDisplayName(r, i18n.language)}
                      </td>
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
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.noColMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
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
