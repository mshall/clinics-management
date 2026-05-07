import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery, useExpensesQuery } from "@/lib/api-hooks";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { ApiError, apiFetchBlob, apiPatch, apiPostFormData } from "@/lib/http";
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
  const [clinicId, setClinicId] = useState("");
  const [category, setCategory] = useState("UTILITIES");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [efCategory, setEfCategory] = useState("");
  const [efVendor, setEfVendor] = useState("");
  const [efAmount, setEfAmount] = useState("");
  const [efStatus, setEfStatus] = useState("");
  const [efDate, setEfDate] = useState("");
  const [efProof, setEfProof] = useState("");

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
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", { style: "currency", currency: "AED" }).format(n);

  const filteredExpenses = useMemo(() => {
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    const formatMoney = (x: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "AED" }).format(x);
    const n = (s: string) => s.trim().toLowerCase();
    const fc = n(efCategory);
    const fv = n(efVendor);
    const fa = efAmount.trim();
    const fs = n(efStatus);
    const fd = n(efDate);
    const fp = n(efProof);
    return expenses.filter((e) => {
      if (fc && !e.category.toLowerCase().includes(fc)) return false;
      if (fv && !(e.vendorName ?? "").toLowerCase().includes(fv)) return false;
      if (fa) {
        const hay = `${e.amount} ${formatMoney(e.amount)}`.toLowerCase();
        if (!hay.includes(fa.toLowerCase())) return false;
      }
      if (fs && !e.status.toLowerCase().includes(fs)) return false;
      if (fd) {
        const ds = new Date(e.incurredAt).toLocaleDateString(loc).toLowerCase();
        if (!ds.includes(fd) && !e.incurredAt.toLowerCase().includes(fd)) return false;
      }
      if (fp) {
        const proofHay = (e.hasProof ? "yes y download proof file" : "no none —").toLowerCase();
        if (!proofHay.includes(fp)) return false;
      }
      return true;
    });
  }, [expenses, efCategory, efVendor, efAmount, efStatus, efDate, efProof, i18n.language]);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("expenses.title")}</h1>
        <p className="text-muted-foreground">{t("expenses.subtitle")}</p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.searchLedger", "Search ledger")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>{t("expenses.from", "From")}</Label>
            <Input className="ltr-nums" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-2">
            <Label>{t("expenses.to", "To")}</Label>
            <Input className="ltr-nums" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className="min-w-[12rem] space-y-2">
            <Label>{t("expenses.clinic")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterClinicId}
              onChange={(e) => {
                setFilterClinicId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("expenses.allClinics", "All clinics")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
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
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.add")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>{t("expenses.clinic")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              <option value="">{t("expenses.pickClinic")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
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
                  {c}
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
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
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
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2">{e.category}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.vendorName ?? "—"}</td>
                      <td className="px-3 py-2 ltr-nums">{money(e.amount)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={e.status === "APPROVED" ? "default" : "secondary"}
                          className={e.status === "REJECTED" ? "border-destructive/60 text-destructive" : undefined}
                        >
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(e.incurredAt).toLocaleDateString(i18n.language === "ar" ? "ar-AE" : "en-AE")}
                      </td>
                      <td className="px-3 py-2">
                        {e.hasProof ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => void downloadProof(e.id, e.proofOriginalName)}
                          >
                            {t("expenses.downloadProof", "Download")}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end">
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
          </div>
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
    </div>
  );
}
