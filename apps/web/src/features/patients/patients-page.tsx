import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import type { PatientDto } from "@/lib/api-schema";
import { useClinicsQuery, usePatientsQuery } from "@/lib/api-hooks";
import { ApiError, apiPost, apiPostFormData } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";

export function PatientsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickSearch, setQuickSearch] = useState("");
  const debouncedQuick = useDebouncedValue(quickSearch, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("mrn");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [pfMrn, setPfMrn] = useState("");
  const [pfName, setPfName] = useState("");
  const [pfGender, setPfGender] = useState("");
  const [pfDob, setPfDob] = useState("");
  const [pfEmail, setPfEmail] = useState("");
  const [pfBranch, setPfBranch] = useState("");

  const query = useMemo(
    () => ({
      search: debouncedQuick,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [debouncedQuick, page, pageSize, sortBy, sortOrder]
  );

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data, isFetching, isError, error } = usePatientsQuery(query);
  const items: PatientDto[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const filteredPatients = useMemo(() => {
    return items.filter((p) => {
      if (pfMrn.trim() && !columnFilterIncludes(p.mrn, pfMrn)) return false;
      const nameHay = `${p.firstNameEn} ${p.lastNameEn} ${p.firstNameAr ?? ""} ${p.lastNameAr ?? ""}`;
      if (pfName.trim() && !columnFilterIncludes(nameHay, pfName)) return false;
      const gLabel = p.gender === "M" ? "male m" : p.gender === "F" ? "female f" : String(p.gender);
      if (
        pfGender.trim() &&
        !columnFilterIncludes(gLabel, pfGender) &&
        !columnFilterIncludes(String(p.gender), pfGender)
      ) {
        return false;
      }
      if (pfDob.trim() && !columnFilterIncludes(p.dob, pfDob)) return false;
      if (pfEmail.trim() && !columnFilterIncludes(p.email ?? "", pfEmail)) return false;
      if (pfBranch.trim() && !columnFilterIncludes(p.homeBranch ?? "", pfBranch)) return false;
      return true;
    });
  }, [items, pfMrn, pfName, pfGender, pfDob, pfEmail, pfBranch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuick]);

  const { data: clinics = [] } = useClinicsQuery();
  const [open, setOpen] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [firstNameEn, setFirstNameEn] = useState("");
  const [lastNameEn, setLastNameEn] = useState("");
  const [firstNameAr, setFirstNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nationalIdDocFile, setNationalIdDocFile] = useState<File | null>(null);
  const [homeBranchId, setHomeBranchId] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      const patient = await apiPost<PatientDto>("/api/v1/patients", {
        firstNameEn,
        lastNameEn,
        firstNameAr: firstNameAr || undefined,
        lastNameAr: lastNameAr || undefined,
        dob,
        gender,
        phone,
        email: email || undefined,
        nationalId: nationalId.trim() || undefined,
        homeBranchId: homeBranchId || undefined,
      });
      if (nationalIdDocFile) {
        const fd = new FormData();
        fd.append("file", nationalIdDocFile);
        await apiPostFormData<PatientDto>(`/api/v1/patients/${patient.id}/national-id-document`, fd);
      }
      return patient;
    },
    onSuccess: () => {
      setFormErr(null);
      setOpen(false);
      setFirstNameEn("");
      setLastNameEn("");
      setFirstNameAr("");
      setLastNameAr("");
      setDob("");
      setGender("M");
      setPhone("");
      setEmail("");
      setNationalId("");
      setNationalIdDocFile(null);
      setHomeBranchId("");
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        const msg = (e.body as { message?: string | string[] }).message;
        setFormErr(Array.isArray(msg) ? msg.join(", ") : String(msg));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("patients.title")}</h1>
          <p className="text-muted-foreground">{t("patients.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <CreateActionButton type="button">{t("patients.newPatient")}</CreateActionButton>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t("patients.registerTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-1">
              {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}
              <div className="space-y-2">
                <Label>{t("patients.firstNameEn")}</Label>
                <Input value={firstNameEn} onChange={(e) => setFirstNameEn(e.target.value)} autoComplete="given-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.lastNameEn")}</Label>
                <Input value={lastNameEn} onChange={(e) => setLastNameEn(e.target.value)} autoComplete="family-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.firstNameAr")}</Label>
                <Input value={firstNameAr} onChange={(e) => setFirstNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.lastNameAr")}</Label>
                <Input value={lastNameAr} onChange={(e) => setLastNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.dob")}</Label>
                <Input className="ltr-nums" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.gender")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="M">{t("patients.genderM")}</option>
                  <option value="F">{t("patients.genderF")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("patients.phone")}</Label>
                <Input className="ltr-nums" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.nationalId")}</Label>
                <Input className="ltr-nums" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.nationalIdDocument")}</Label>
                <Input
                  className="cursor-pointer text-sm"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setNationalIdDocFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">{t("patients.nationalIdDocumentHint")}</p>
                {nationalIdDocFile ? <p className="text-xs text-muted-foreground ltr-nums">{nationalIdDocFile.name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("patients.email")}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.homeBranch")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={homeBranchId}
                  onChange={(e) => setHomeBranchId(e.target.value)}
                >
                  <option value="">{t("patients.optionalBranch")}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <CreateActionButton
                type="button"
                className="mt-2"
                disabled={!firstNameEn || !lastNameEn || !dob || !phone || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {t("patients.submitRegister")}
              </CreateActionButton>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("patients.search")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!pfMrn.trim() && !pfName.trim() && !pfGender.trim() && !pfDob.trim() && !pfEmail.trim() && !pfBranch.trim()}
            onClick={() => {
              setPfMrn("");
              setPfName("");
              setPfGender("");
              setPfDob("");
              setPfEmail("");
              setPfBranch("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
          ) : null}
          <Input
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder={t("patients.searchPlaceholder")}
            aria-busy={isFetching}
          />
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-start">
                  <SortableTh
                    label={t("patients.mrn")}
                    column="mrn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfMrn}
                    onFilterChange={setPfMrn}
                  />
                  <SortableTh
                    label={i18n.language === "ar" ? "الاسم" : "Name"}
                    column="lastNameEn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfName}
                    onFilterChange={setPfName}
                  />
                  <SortableTh
                    label={t("patients.gender")}
                    column="gender"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    align="center"
                    filterValue={pfGender}
                    onFilterChange={setPfGender}
                  />
                  <SortableTh
                    label={t("patients.dob")}
                    column="dob"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfDob}
                    onFilterChange={setPfDob}
                  />
                  <FilterTh label={t("patients.email")} value={pfEmail} onChange={setPfEmail} />
                  <FilterTh label={t("patients.branch")} value={pfBranch} onChange={setPfBranch} />
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p) => (
                  <tr
                    key={p.id}
                    role="link"
                    tabIndex={0}
                    className="border-t border-border transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs ltr-nums">{p.mrn}</td>
                    <td className="px-3 py-2">
                      {i18n.language === "ar" && p.firstNameAr ? (
                        <span>
                          {p.firstNameAr} {p.lastNameAr}
                        </span>
                      ) : (
                        <span>
                          {p.firstNameEn} {p.lastNameEn}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {p.gender === "M" ? t("patients.genderM") : p.gender === "F" ? t("patients.genderF") : p.gender}
                      </span>
                    </td>
                    <td className="px-3 py-2 ltr-nums">{p.dob}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-muted-foreground">{p.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.homeBranch}</td>
                  </tr>
                ))}
                {items.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.empty")}
                    </td>
                  </tr>
                ) : null}
                {items.length > 0 && filteredPatients.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
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
            total={total}
            totalPages={totalPages}
            disabled={isFetching}
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

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
