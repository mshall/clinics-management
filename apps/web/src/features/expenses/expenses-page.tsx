import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Receipt } from "lucide-react";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery, useExpensesQuery } from "@/lib/api-hooks";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import type { ExpenseDto } from "@/lib/api-types";
import { ApiError, apiFetchBlob, apiPatch, apiPostFormData } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";
import {
  formatClinicName,
  formatExpenseCategory,
  formatExpenseStatus,
  localeForLanguage,
} from "@/lib/locale-display";
import { defaultMonthRange } from "@/stores/date-range-store";

export function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const initialRange = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [filterClinicId, setFilterClinicId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("incurredAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const { data: expData, isPending, isError, error } = useExpensesQuery({
    page,
    pageSize,
    sortBy,
    sortOrder,
    from,
    to,
    clinicId: filterClinicId || undefined,
  });

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };
  const expenses = expData?.items ?? [];
  const expTotal = expData?.total ?? 0;
  const expTotalPages = expData?.totalPages ?? 1;
  const { data: clinics = [] } = useClinicsQuery();
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const [clinicId, setClinicId] = useState("");
  useEffect(() => {
    if (singleManagedClinic) {
      setClinicId(singleManagedClinic.id);
      setFilterClinicId(singleManagedClinic.id);
    }
  }, [singleManagedClinic?.id]);

  useEffect(() => {
    return () => {
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }
    };
  }, []);

  const closeProofViewer = () => {
    if (viewerUrlRef.current) {
      URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = null;
    }
    setProofViewer(null);
  };
  const [category, setCategory] = useState("UTILITIES");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const viewerUrlRef = useRef<string | null>(null);
  const [proofViewer, setProofViewer] = useState<{ filename: string; url: string; contentType: string } | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [efCategory, setEfCategory] = useState("");
  const [efVendor, setEfVendor] = useState("");
  const [efAmount, setEfAmount] = useState("");
  const [efStatus, setEfStatus] = useState("");
  const [efDate, setEfDate] = useState("");
  const [efProof, setEfProof] = useState("");
  const [detail, setDetail] = useState<ExpenseDto | null>(null);

  const clinicById = useMemo(() => new Map(clinics.map((c) => [c.id, c])), [clinics]);
  const clinicLabelForExpense = (e: ExpenseDto) => {
    const c = clinicById.get(e.clinicId);
    return c ? formatClinicName(c, i18n.language) : e.clinicId;
  };

  const createMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("clinicId", clinicId);
      fd.append("category", category);
      if (vendor.trim()) fd.append("vendorName", vendor.trim());
      fd.append("amount", String(Number.parseFloat(amount)));
      fd.append("currency", "AED");
      fd.append("incurredAt", new Date().toISOString());
      if (proofFile) fd.append("proof", proofFile);
      return apiPostFormData<unknown>("/api/v1/expenses", fd);
    },
    onSuccess: () => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      setAmount("");
      setVendor("");
      setProofFile(null);
      if (proofInputRef.current) proofInputRef.current.value = "";
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      apiPatch<unknown>(`/api/v1/expenses/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
  });

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), { style: "currency", currency: "AED" }).format(n);

  const filteredExpenses = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    const formatMoney = (x: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "AED" }).format(x);
    return expenses.filter((e) => {
      if (efCategory.trim() && !columnFilterIncludes(formatExpenseCategory(e.category, t), efCategory)) return false;
      if (efVendor.trim() && !columnFilterIncludes(e.vendorName ?? "", efVendor)) return false;
      if (efAmount.trim()) {
        const hay = `${e.amount} ${formatMoney(e.amount)}`;
        if (!columnFilterIncludes(hay, efAmount)) return false;
      }
      if (efStatus.trim() && !columnFilterIncludes(formatExpenseStatus(e.status, t), efStatus)) return false;
      if (efDate.trim()) {
        const ds = new Date(e.incurredAt).toLocaleDateString(loc);
        if (!columnFilterIncludes(ds, efDate) && !columnFilterIncludes(e.incurredAt, efDate)) return false;
      }
      if (efProof.trim()) {
        const proofHay = e.hasProof ? "yes y view download proof file" : "no none —";
        if (!columnFilterIncludes(proofHay, efProof)) return false;
      }
      return true;
    });
  }, [expenses, efCategory, efVendor, efAmount, efStatus, efDate, efProof, i18n.language]);
  const selectedPeriodTotal = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const viewProof = async (id: string, filename: string | null) => {
    try {
      const { blob, contentType } = await apiFetchBlob(`/api/v1/expenses/${id}/proof`);
      const url = URL.createObjectURL(blob);
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = url;
      setProofViewer({ filename: filename?.trim() || "expense-proof", url, contentType });
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
      else alert(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadProof = async (id: string, filename: string | null) => {
    try {
      const { blob } = await apiFetchBlob(`/api/v1/expenses/${id}/proof`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename?.trim() || "expense-proof";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
      else alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      {proofViewer ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeProofViewer}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="truncate text-sm font-medium">{proofViewer.filename}</p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={proofViewer.url} download={proofViewer.filename}>
                    {t("expenses.downloadProof", "Download")}
                  </a>
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={closeProofViewer}>
                  {t("common.close")}
                </Button>
              </div>
            </div>
            <div className="max-h-[calc(90vh-3rem)] overflow-auto p-4">
              {proofViewer.contentType.startsWith("image/") ? (
                <img src={proofViewer.url} alt="" className="mx-auto max-h-[70vh] max-w-full object-contain" />
              ) : proofViewer.contentType.includes("pdf") ? (
                <iframe title={proofViewer.filename} src={proofViewer.url} className="h-[70vh] w-full rounded border" />
              ) : (
                <a href={proofViewer.url} download={proofViewer.filename} className="text-primary underline">
                  {t("expenses.downloadProof", "Download")}
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("expenses.title")}</h1>
        <p className="text-muted-foreground">{t("expenses.subtitle")}</p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="lg:max-w-2xl">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium">{t("expenses.searchLedger", "Search ledger")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("expenses.from", "From")}</Label>
              <Input className="h-9 ltr-nums" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("expenses.to", "To")}</Label>
              <Input className="h-9 ltr-nums" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label className="text-xs">{t("expenses.clinic")}</Label>
              {singleManagedClinic ? (
                <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-2 text-sm">
                  {formatClinicName(singleManagedClinic, i18n.language)}
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
                  <option value="">{t("expenses.allClinics", "All clinics")}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatClinicName(c, i18n.language)}
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
                const r = defaultMonthRange();
                setFrom(r.from);
                setTo(r.to);
                setPage(1);
              }}
            >
              {t("expenses.thisMonth", "This month")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Receipt className="h-4 w-4 text-rose-500" />
              {t("expenses.periodTotal", "Total expenses")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-4 pt-0">
            <p className="text-lg font-semibold ltr-nums">{money(selectedPeriodTotal)}</p>
            <p className="text-xs text-muted-foreground ltr-nums">
              {from} → {to}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.add")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>{t("expenses.clinic")}</Label>
            {singleManagedClinic ? (
              <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {formatClinicName(singleManagedClinic, i18n.language)}
              </p>
            ) : (
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
              >
                <option value="">{t("expenses.pickClinic")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClinicName(c, i18n.language)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("expenses.category")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {formatExpenseCategory(c, t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("expenses.vendor")}</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("expenses.amount")}</Label>
            <Input className="ltr-nums" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-5">
            <Label>{t("expenses.paymentProof")}</Label>
            <Input
              ref={proofInputRef}
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png,image/gif,image/webp"
              className="cursor-pointer text-sm file:me-3 file:rounded file:border file:border-input file:bg-muted file:px-2 file:py-1 file:text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                const max = 15 * 1024 * 1024;
                if (f && f.size > max) {
                  setFormErr(t("expenses.proofTooLarge", "File is too large (max 15 MB)."));
                  setProofFile(null);
                  e.target.value = "";
                  return;
                }
                setFormErr(null);
                setProofFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("expenses.paymentProofHint")}</p>
            {proofFile ? (
              <p className="text-xs text-muted-foreground">
                {t("expenses.selectedFile")}: <span className="font-medium text-foreground">{proofFile.name}</span>
              </p>
            ) : null}
          </div>
          <div className="flex items-end">
            <CreateActionButton
              type="button"
              disabled={!clinicId || !amount || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {t("expenses.submit")}
            </CreateActionButton>
          </div>
          {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("expenses.ledger")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!efCategory.trim() && !efVendor.trim() && !efAmount.trim() && !efStatus.trim() && !efDate.trim() && !efProof.trim()}
            onClick={() => {
              setEfCategory("");
              setEfVendor("");
              setEfAmount("");
              setEfStatus("");
              setEfDate("");
              setEfProof("");
            }}
          >
            {t("patients.clearFilters")}
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <SortableTh
                    label={t("expenses.category")}
                    column="category"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efCategory}
                    onFilterChange={setEfCategory}
                  />
                  <SortableTh
                    label={t("expenses.vendor")}
                    column="vendorName"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efVendor}
                    onFilterChange={setEfVendor}
                  />
                  <SortableTh
                    label={t("expenses.amount")}
                    column="amount"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efAmount}
                    onFilterChange={setEfAmount}
                  />
                  <SortableTh
                    label={t("expenses.status")}
                    column="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efStatus}
                    onFilterChange={setEfStatus}
                  />
                  <SortableTh
                    label={t("expenses.date")}
                    column="incurredAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efDate}
                    onFilterChange={setEfDate}
                  />
                  <FilterTh label={t("expenses.proof")} value={efProof} onChange={setEfProof} />
                  <th className="align-top px-2 py-2 text-xs font-medium text-muted-foreground">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : null}
                {!isPending &&
                  filteredExpenses.map((e) => (
                    <tr
                      key={e.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/50"
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetail(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setDetail(e);
                        }
                      }}
                    >
                      <td className="px-3 py-2">{formatExpenseCategory(e.category, t)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.vendorName ?? "—"}</td>
                      <td className="px-3 py-2 ltr-nums">{money(e.amount)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={e.status === "APPROVED" ? "default" : "secondary"}
                          className={e.status === "REJECTED" ? "border-destructive/60 text-destructive" : undefined}
                        >
                          {formatExpenseStatus(e.status, t)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(e.incurredAt).toLocaleDateString(localeForLanguage(i18n.language))}
                      </td>
                      <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                        {e.hasProof ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs"
                              onClick={() => void viewProof(e.id, e.proofOriginalName)}
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              {t("expenses.viewProof", "View")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => void downloadProof(e.id, e.proofOriginalName)}
                            >
                              {t("expenses.downloadProof", "Download")}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end" onClick={(ev) => ev.stopPropagation()}>
                        {e.status === "PENDING" ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" onClick={() => statusMut.mutate({ id: e.id, status: "APPROVED" })}>
                              {t("expenses.approve")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: e.id, status: "REJECTED" })}>
                              {t("expenses.reject")}
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                {!isPending && expenses.length > 0 && filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("expenses.noLedgerMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={expTotal}
            totalPages={expTotalPages}
            disabled={isPending}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("expenses.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.clinic")}</dt>
                <dd className="font-medium">{clinicLabelForExpense(detail)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.category")}</dt>
                <dd className="font-medium">{formatExpenseCategory(detail.category, t)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.vendor")}</dt>
                <dd className="font-medium">{detail.vendorName?.trim() || "—"}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.amount")}</dt>
                <dd className="font-medium ltr-nums">{money(detail.amount)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.status")}</dt>
                <dd>
                  <Badge
                    variant={detail.status === "APPROVED" ? "default" : "secondary"}
                    className={detail.status === "REJECTED" ? "border-destructive/60 text-destructive" : undefined}
                  >
                    {formatExpenseStatus(detail.status, t)}
                  </Badge>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.date")}</dt>
                <dd className="font-medium ltr-nums">
                  {new Date(detail.incurredAt).toLocaleString(localeForLanguage(i18n.language))}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.proof")}</dt>
                <dd>
                  {detail.hasProof ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => void viewProof(detail.id, detail.proofOriginalName)}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        {t("expenses.viewProof")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => void downloadProof(detail.id, detail.proofOriginalName)}
                      >
                        {t("expenses.downloadProof")}
                      </Button>
                      {detail.proofOriginalName?.trim() ? (
                        <span className="self-center text-xs text-muted-foreground">{detail.proofOriginalName}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{t("expenses.noProof")}</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="min-w-[7rem] shrink-0 text-muted-foreground">{t("expenses.entryId")}</dt>
                <dd className="font-mono text-xs text-muted-foreground">{detail.id}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
