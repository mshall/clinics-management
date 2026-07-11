import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAttendanceQuery, useClinicsQuery, useEmployeesQuery, useHrSummaryQuery, useLeaveRequestsQuery } from "@/lib/api-hooks";
import type { EmployeeDto } from "@/lib/api-types";
import { EmployeeDeleteConfirmDialog, type EmployeeDeleteTarget } from "@/features/hr/employee-delete-confirm-dialog";
import { canManageEmployees } from "@/lib/employee-manage-policy";
import { ApiError, apiDelete, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";
import {
  formatAttendanceStatus,
  formatClinicNameFields,
  formatLeaveStatus,
  formatLeaveType,
  formatEmploymentType,
  formatClinicName,
  localeForLanguage,
} from "@/lib/locale-display";
import { employeeToPickListItem, formatEmployeeName } from "@/lib/employee-display";
import { useAuthStore } from "@/stores/auth-store";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import {
  collectAttendanceCreateIssues,
  collectEmployeeCreateIssues,
  collectLeaveCreateIssues,
} from "@/lib/create-form-validation";

type Tab = "summary" | "employees" | "attendance" | "leave";

const HR_TABS: Tab[] = ["summary", "employees", "attendance", "leave"];

function parseHrTab(value: string | null): Tab {
  if (value && HR_TABS.includes(value as Tab)) return value as Tab;
  return "summary";
}

const EMP_TYPE_VALUES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "LOCUM"] as const;

export function HrPage() {
  const { t, i18n } = useTranslation();
  const leaveTypeItems: PickListItem[] = useMemo(
    () =>
      (["ANNUAL", "SICK", "UNPAID", "OTHER"] as const).map((value) => ({
        value,
        label: formatLeaveType(value, t),
      })),
    [t],
  );
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canManage = canManageEmployees(authUser?.role);
  const { data: clinics = [] } = useClinicsQuery();
  const [tab, setTab] = useState<Tab>(() => parseHrTab(searchParams.get("tab")));

  useEffect(() => {
    setTab(parseHrTab(searchParams.get("tab")));
  }, [searchParams]);
  const summary = useHrSummaryQuery();
  const employeesPick = useEmployeesQuery({ page: 1, pageSize: 100 });
  const pickEmployees = employeesPick.data?.items ?? [];
  const employeePickItems: PickListItem[] = useMemo(
    () => pickEmployees.map((e) => employeeToPickListItem(e, i18n.language)),
    [pickEmployees, i18n.language],
  );

  const [empPage, setEmpPage] = useState(1);
  const [empPs, setEmpPs] = useState(25);
  const [empSortBy, setEmpSortBy] = useState("lastNameEn");
  const [empSortOrder, setEmpSortOrder] = useState<SortOrder>("asc");

  const [attPage, setAttPage] = useState(1);
  const [attPs, setAttPs] = useState(10);
  const [attListEmp, setAttListEmp] = useState("");
  const [attFrom, setAttFrom] = useState("");
  const [attTo, setAttTo] = useState("");
  const [attListStatus, setAttListStatus] = useState("");
  const [attSortBy, setAttSortBy] = useState("workDate");
  const [attSortOrder, setAttSortOrder] = useState<SortOrder>("desc");
  const attendance = useAttendanceQuery({
    page: attPage,
    pageSize: attPs,
    employeeId: attListEmp || undefined,
    workDateFrom: attFrom || undefined,
    workDateTo: attTo || undefined,
    status: attListStatus || undefined,
    sortBy: attSortBy,
    sortOrder: attSortOrder,
  });
  const attRows = attendance.data?.items ?? [];
  const attTotal = attendance.data?.total ?? 0;
  const attTotalPages = attendance.data?.totalPages ?? 1;

  const [leavePage, setLeavePage] = useState(1);
  const [leavePs, setLeavePs] = useState(10);
  const [leaveListEmp, setLeaveListEmp] = useState("");
  const [leaveListStatus, setLeaveListStatus] = useState("");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveSortBy, setLeaveSortBy] = useState("startDate");
  const [leaveSortOrder, setLeaveSortOrder] = useState<SortOrder>("desc");
  const leave = useLeaveRequestsQuery({
    page: leavePage,
    pageSize: leavePs,
    employeeId: leaveListEmp || undefined,
    status: leaveListStatus || undefined,
    startFrom: leaveFrom || undefined,
    startTo: leaveTo || undefined,
    sortBy: leaveSortBy,
    sortOrder: leaveSortOrder,
  });
  const leaveRows = leave.data?.items ?? [];
  const leaveTotal = leave.data?.total ?? 0;
  const leaveTotalPages = leave.data?.totalPages ?? 1;

  const [ecfNum, setEcfNum] = useState("");
  const [ecfClinic, setEcfClinic] = useState("");
  const [ecfName, setEcfName] = useState("");
  const [ecfTitle, setEcfTitle] = useState("");
  const [ecfSalary, setEcfSalary] = useState("");
  const [acfDate, setAcfDate] = useState("");
  const [acfEmp, setAcfEmp] = useState("");
  const [acfClinic, setAcfClinic] = useState("");
  const [acfStat, setAcfStat] = useState("");
  const [lcfType, setLcfType] = useState("");
  const [lcfDates, setLcfDates] = useState("");
  const [lcfStat, setLcfStat] = useState("");

  const [debouncedNameFilter, setDebouncedNameFilter] = useState("");
  const [debouncedClinicFilter, setDebouncedClinicFilter] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedNameFilter(ecfName), 300);
    return () => window.clearTimeout(tid);
  }, [ecfName]);
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedClinicFilter(ecfClinic), 300);
    return () => window.clearTimeout(tid);
  }, [ecfClinic]);
  useEffect(() => {
    setEmpPage(1);
  }, [debouncedNameFilter, debouncedClinicFilter]);

  const employees = useEmployeesQuery({
    page: empPage,
    pageSize: empPs,
    nameFilter: debouncedNameFilter.trim() || undefined,
    clinicFilter: debouncedClinicFilter.trim() || undefined,
    sortBy: empSortBy,
    sortOrder: empSortOrder,
  });
  const empRows = employees.data?.items ?? [];
  const empTotal = employees.data?.total ?? 0;
  const empTotalPages = employees.data?.totalPages ?? 1;

  const [leaveReqOpen, setLeaveReqOpen] = useState(false);
  const [createEmpOpen, setCreateEmpOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<EmployeeDeleteTarget | null>(null);
  const [empClinic, setEmpClinic] = useState("");
  const [empFn, setEmpFn] = useState("");
  const [empLn, setEmpLn] = useState("");
  const [empFnAr, setEmpFnAr] = useState("");
  const [empLnAr, setEmpLnAr] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empTitle, setEmpTitle] = useState("Staff");
  const [empType, setEmpType] = useState("FULL_TIME");
  const [empSalary, setEmpSalary] = useState("9000");
  const [empIdDocFile, setEmpIdDocFile] = useState<File | null>(null);
  const empValidation = useValidationIssuesDialog({ intent: "create" });
  const attValidation = useValidationIssuesDialog({ intent: "create" });
  const leaveValidation = useValidationIssuesDialog({ intent: "create" });

  const clinicItems: PickListItem[] = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );
  const empTypeItems: PickListItem[] = useMemo(
    () => EMP_TYPE_VALUES.map((value) => ({ value, label: formatEmploymentType(value, t) })),
    [t],
  );

  const [attEmp, setAttEmp] = useState("");
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [leaveEmp, setLeaveEmp] = useState("");
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [leaveStart, setLeaveStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const createAtt = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/hr/attendance", {
        employeeId: attEmp,
        workDate: attDate,
      }),
    onSuccess: () => {
      attValidation.clear();
      void qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
    },
    onError: (e: unknown) => {
      attValidation.showError(e);
    },
  });

  const createLeave = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/hr/leave-requests", {
        employeeId: leaveEmp,
        type: leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
      }),
    onSuccess: () => {
      leaveValidation.clear();
      void qc.invalidateQueries({ queryKey: ["hr", "leave"] });
      void qc.invalidateQueries({ queryKey: ["hr"] });
      setLeaveReqOpen(false);
    },
    onError: (e: unknown) => {
      leaveValidation.showError(e);
    },
  });

  const leaveStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      apiPatch(`/api/v1/hr/leave-requests/${id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr"] }),
  });

  const createEmpMut = useMutation({
    mutationFn: async () => {
      const emp = await apiPost<EmployeeDto>("/api/v1/hr/employees", {
        clinicId: empClinic,
        firstNameEn: empFn.trim(),
        lastNameEn: empLn.trim(),
        firstNameAr: empFnAr.trim() || undefined,
        lastNameAr: empLnAr.trim() || undefined,
        email: empEmail.trim() || undefined,
        phone: empPhone.replace(/\D/g, ""),
        jobTitle: empTitle.trim(),
        employmentType: empType,
        hireDate: new Date().toISOString().slice(0, 10),
        salaryBase: Number.parseFloat(empSalary),
      });
      if (empIdDocFile) {
        const fd = new FormData();
        fd.append("file", empIdDocFile);
        await apiPostFormData<EmployeeDto>(`/api/v1/hr/employees/${emp.id}/id-document`, fd);
      }
      return emp;
    },
    onSuccess: (emp) => {
      empValidation.clear();
      setCreateEmpOpen(false);
      setEmpFn("");
      setEmpLn("");
      setEmpFnAr("");
      setEmpLnAr("");
      setEmpEmail("");
      setEmpPhone("");
      setEmpClinic("");
      setEmpIdDocFile(null);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(t("hr.employeeCreated", "Employee created."));
      navigate(`/hr/employees/${emp.id}`);
    },
    onError: (e: unknown) => {
      empValidation.showError(e);
    },
  });

  const deleteEmpMut = useMutation({
    mutationFn: (employeeId: string) => apiDelete(`/api/v1/hr/employees/${employeeId}`),
    onSuccess: () => {
      setEmployeeToDelete(null);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(t("hr.deleteSuccess", "Employee deleted."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });


  const handleCreateEmployee = () => {
    const issues = collectEmployeeCreateIssues(
      { clinicId: empClinic, firstName: empFn, lastName: empLn, phone: empPhone, salary: empSalary },
      t,
    );
    if (issues.length > 0) {
      empValidation.showIssues(issues);
      return;
    }
    createEmpMut.mutate();
  };

  const handleCreateAttendance = () => {
    const issues = collectAttendanceCreateIssues({ employeeId: attEmp }, t);
    if (issues.length > 0) {
      attValidation.showIssues(issues);
      return;
    }
    createAtt.mutate();
  };

  const handleCreateLeave = () => {
    const issues = collectLeaveCreateIssues({ employeeId: leaveEmp }, t);
    if (issues.length > 0) {
      leaveValidation.showIssues(issues);
      return;
    }
    createLeave.mutate();
  };

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), { style: "currency", currency: "AED" }).format(n);

  const filteredEmpRows = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    const fmt = (x: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "AED" }).format(x);
    return empRows.filter((e) => {
      if (ecfNum.trim() && !columnFilterIncludes(e.employeeNumber, ecfNum)) return false;
      if (ecfTitle.trim() && !columnFilterIncludes(e.jobTitle, ecfTitle)) return false;
      if (ecfSalary.trim()) {
        const hay = `${e.salaryBase} ${fmt(e.salaryBase)}`;
        if (!columnFilterIncludes(hay, ecfSalary)) return false;
      }
      return true;
    });
  }, [empRows, ecfNum, ecfTitle, ecfSalary, i18n.language]);

  const filteredAttRows = useMemo(() => {
    return attRows.filter((a) => {
      if (acfDate.trim() && !columnFilterIncludes(a.workDate, acfDate)) return false;
      if (acfEmp.trim()) {
        const hay = `${a.employeeFullName ?? ""} ${a.employeeNumber ?? ""} ${a.employeeId}`;
        if (!columnFilterIncludes(hay, acfEmp)) return false;
      }
      if (acfClinic.trim() && !columnFilterIncludes(a.clinicNameEn ?? "", acfClinic)) return false;
      if (acfStat.trim() && !columnFilterIncludes(formatAttendanceStatus(a.status, t), acfStat)) return false;
      return true;
    });
  }, [attRows, acfDate, acfEmp, acfClinic, acfStat]);

  const filteredLeaveRows = useMemo(() => {
    return leaveRows.filter((l) => {
      if (lcfType.trim() && !columnFilterIncludes(formatLeaveType(l.type, t), lcfType)) return false;
      if (lcfDates.trim()) {
        const range = `${l.startDate} ${l.endDate}`;
        if (!columnFilterIncludes(range, lcfDates)) return false;
      }
      if (lcfStat.trim() && !columnFilterIncludes(formatLeaveStatus(l.status, t), lcfStat)) return false;
      return true;
    });
  }, [leaveRows, lcfType, lcfDates, lcfStat]);

  const onEmpSort = (column: string) => {
    const next = toggleSort(empSortBy, empSortOrder, column);
    setEmpSortBy(next.sortBy);
    setEmpSortOrder(next.sortOrder);
    setEmpPage(1);
  };
  const onAttSort = (column: string) => {
    const next = toggleSort(attSortBy, attSortOrder, column);
    setAttSortBy(next.sortBy);
    setAttSortOrder(next.sortOrder);
    setAttPage(1);
  };
  const onLeaveSort = (column: string) => {
    const next = toggleSort(leaveSortBy, leaveSortOrder, column);
    setLeaveSortBy(next.sortBy);
    setLeaveSortOrder(next.sortOrder);
    setLeavePage(1);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "summary", label: t("hr.tabSummary") },
    { id: "employees", label: t("hr.employees") },
    { id: "attendance", label: t("hr.attendance") },
    { id: "leave", label: t("hr.leave") },
  ];

  const attStatusItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("hr.anyStatus", "Any") },
      { value: "PRESENT", label: "PRESENT" },
      { value: "LATE", label: "LATE" },
      { value: "ABSENT", label: "ABSENT" },
      { value: "ON_LEAVE", label: "ON_LEAVE" },
    ],
    [t]
  );
  const leaveStatusItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("hr.anyStatus", "Any") },
      { value: "PENDING", label: "PENDING" },
      { value: "APPROVED", label: "APPROVED" },
      { value: "REJECTED", label: "REJECTED" },
    ],
    [t]
  );

  return (
    <div className="space-y-6">
      <ValidationIssuesDialog {...empValidation.dialogProps} />
      <ValidationIssuesDialog {...attValidation.dialogProps} />
      <ValidationIssuesDialog {...leaveValidation.dialogProps} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("hr.title")}</h1>
        <p className="text-muted-foreground">{t("hr.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <Button
            key={x.id}
            size="sm"
            variant={tab === x.id ? "default" : "outline"}
            onClick={() => {
              setTab(x.id);
              setSearchParams(x.id === "summary" ? {} : { tab: x.id }, { replace: true });
            }}
          >
            {x.label}
          </Button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("hr.kpiHeadcount")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold ltr-nums">
              {summary.isPending ? "—" : summary.data?.employeeCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("hr.kpiPayroll")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold ltr-nums">
              {summary.isPending ? "—" : money(summary.data?.monthlyPayrollEstimate ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("hr.kpiPendingLeave")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold ltr-nums">
              {summary.isPending ? "—" : summary.data?.pendingLeaveRequests}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "employees" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">{t("hr.employees")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("hr.employeesSubtitle", "Manage employees, attendance, and leave for your organization.")}</p>
            </div>
            {canManage ? (
              <Dialog open={createEmpOpen} onOpenChange={setCreateEmpOpen}>
                <DialogTrigger asChild>
                  <CreateActionButton type="button">{t("hr.addEmployee")}</CreateActionButton>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>{t("hr.addEmployee")}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    {empValidation.formErr ? <p className="text-sm text-destructive sm:col-span-full">{empValidation.formErr}</p> : null}
                    <div className="space-y-2 sm:col-span-2">
                      <Label required>{t("hr.clinic")}</Label>
                      <SearchablePickList
                        items={clinicItems}
                        value={empClinic}
                        onValueChange={setEmpClinic}
                        searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                        placeholder={t("hr.pickClinic")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label required>{t("patients.firstNameEn")}</Label>
                      <Input value={empFn} onChange={(e) => setEmpFn(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label required>{t("patients.lastNameEn")}</Label>
                      <Input value={empLn} onChange={(e) => setEmpLn(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patients.firstNameAr")}</Label>
                      <Input value={empFnAr} onChange={(e) => setEmpFnAr(e.target.value)} dir="auto" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patients.lastNameAr")}</Label>
                      <Input value={empLnAr} onChange={(e) => setEmpLnAr(e.target.value)} dir="auto" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("hr.email")}</Label>
                      <Input type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label required>{t("hr.phone")}</Label>
                      <Input
                        className="ltr-nums"
                        inputMode="numeric"
                        value={empPhone}
                        onChange={(e) => setEmpPhone(e.target.value.replace(/\D/g, "").slice(0, 20))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("hr.jobTitle")}</Label>
                      <Input value={empTitle} onChange={(e) => setEmpTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("hr.employmentType")}</Label>
                      <SearchablePickList
                        items={empTypeItems}
                        value={empType}
                        onValueChange={setEmpType}
                        searchPlaceholder={t("hr.filterEmpType")}
                        placeholder={t("hr.employmentType")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("hr.salaryBase")}</Label>
                      <Input className="ltr-nums" type="number" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>{t("hr.idDocument")}</Label>
                      <Input
                        className="cursor-pointer text-sm"
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => setEmpIdDocFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <CreateActionButton
                        type="button"
                        disabled={createEmpMut.isPending}
                        onClick={handleCreateEmployee}
                      >
                        {t("hr.saveEmployee")}
                      </CreateActionButton>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={!ecfNum.trim() && !ecfClinic.trim() && !ecfName.trim() && !ecfTitle.trim() && !ecfSalary.trim()}
                onClick={() => {
                  setEcfNum("");
                  setEcfClinic("");
                  setEcfName("");
                  setEcfTitle("");
                  setEcfSalary("");
                }}
              >
                {t("patients.clearColFilters", "Clear column filters")}
              </Button>
            </div>
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <SortableTh
                      label="#"
                      column="employeeNumber"
                      sortBy={empSortBy}
                      sortOrder={empSortOrder}
                      onSort={onEmpSort}
                      filterValue={ecfNum}
                      onFilterChange={setEcfNum}
                    />
                    <FilterTh className="text-start" label={t("hr.clinic")} value={ecfClinic} onChange={setEcfClinic} />
                    <SortableTh
                      label={t("hr.name")}
                      column="lastNameEn"
                      sortBy={empSortBy}
                      sortOrder={empSortOrder}
                      onSort={onEmpSort}
                      filterValue={ecfName}
                      onFilterChange={setEcfName}
                    />
                    <SortableTh
                      label={t("hr.jobTitle")}
                      column="jobTitle"
                      sortBy={empSortBy}
                      sortOrder={empSortOrder}
                      onSort={onEmpSort}
                      filterValue={ecfTitle}
                      onFilterChange={setEcfTitle}
                    />
                    <SortableTh
                      label={t("hr.salaryBase")}
                      column="salaryBase"
                      sortBy={empSortBy}
                      sortOrder={empSortOrder}
                      onSort={onEmpSort}
                      filterValue={ecfSalary}
                      onFilterChange={setEcfSalary}
                    />
                    {canManage ? (
                      <th className="px-2 py-2 text-end text-xs font-medium text-muted-foreground">
                        {t("common.actions", "Actions")}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmpRows.map((e) => (
                    <tr
                      key={e.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/hr/employees/${e.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/hr/employees/${e.id}`);
                        }
                      }}
                    >
                      <td className="px-2 py-2 font-mono text-xs">{e.employeeNumber}</td>
                      <td className="px-2 py-2 text-start align-middle text-muted-foreground">
                        {formatClinicNameFields(e.clinicNameEn, null, i18n.language)}
                      </td>
                      <td className="px-2 py-2">
                        {formatEmployeeName(e, i18n.language)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{e.jobTitle}</td>
                      <td className="px-2 py-2 ltr-nums">{money(e.salaryBase)}</td>
                      {canManage ? (
                        <td className="px-2 py-2 text-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={t("common.delete", "Delete")}
                            disabled={deleteEmpMut.isPending}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setEmployeeToDelete({
                                id: e.id,
                                employeeNumber: e.employeeNumber,
                                firstNameEn: e.firstNameEn,
                                lastNameEn: e.lastNameEn,
                                firstNameAr: e.firstNameAr,
                                lastNameAr: e.lastNameAr,
                                clinicId: e.clinicId,
                                clinicNameEn: e.clinicNameEn,
                                jobTitle: e.jobTitle,
                                employmentType: e.employmentType,
                                hireDate: e.hireDate,
                                salaryBase: e.salaryBase,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
            <TablePagination
              page={empPage}
              pageSize={empPs}
              total={empTotal}
              totalPages={empTotalPages}
              disabled={employees.isFetching}
              onPageChange={setEmpPage}
              onPageSizeChange={(s) => {
                setEmpPs(s);
                setEmpPage(1);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <EmployeeDeleteConfirmDialog
        open={employeeToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteEmpMut.isPending) setEmployeeToDelete(null);
        }}
        employee={employeeToDelete}
        pending={deleteEmpMut.isPending}
        onConfirm={() => {
          if (employeeToDelete) deleteEmpMut.mutate(employeeToDelete.id);
        }}
      />

      {tab === "attendance" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hr.attendance")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.attendanceIntro", "Record new attendance and review history by employee and date.")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <CardTitle className="mb-2 text-sm font-medium">{t("hr.recordAttendance")}</CardTitle>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1 space-y-2">
                  <Label required>{t("hr.employee")}</Label>
                  <SearchablePickList
                    items={employeePickItems}
                    value={attEmp}
                    onValueChange={setAttEmp}
                    searchPlaceholder={t("hr.searchPlaceholder", "Name or number")}
                    placeholder={t("hr.pickEmployee")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("hr.workDate")}</Label>
                  <Input className="ltr-nums" type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
                </div>
                <CreateActionButton type="button" disabled={createAtt.isPending} onClick={handleCreateAttendance}>
                  {t("hr.submitAttendance")}
                </CreateActionButton>
              </div>
              {attValidation.formErr ? <p className="text-sm text-destructive">{attValidation.formErr}</p> : null}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">{t("hr.attendanceHistory", "Attendance history")}</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!acfDate.trim() && !acfEmp.trim() && !acfClinic.trim() && !acfStat.trim()}
                  onClick={() => {
                    setAcfDate("");
                    setAcfEmp("");
                    setAcfClinic("");
                    setAcfStat("");
                  }}
                >
                  {t("patients.clearColFilters", "Clear column filters")}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1 space-y-2">
                  <Label>{t("hr.filterEmployee", "Filter employee")}</Label>
                  <SearchablePickList
                    items={[{ value: "", label: t("hr.anyEmployee", "Any") }, ...employeePickItems]}
                    value={attListEmp}
                    onValueChange={(v) => {
                      setAttListEmp(v);
                      setAttPage(1);
                    }}
                    searchPlaceholder={t("hr.searchPlaceholder", "Name or number")}
                    placeholder={t("hr.employee")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("hr.from", "From")}</Label>
                  <Input className="ltr-nums" type="date" value={attFrom} onChange={(e) => { setAttFrom(e.target.value); setAttPage(1); }} />
                </div>
                <div className="space-y-2">
                  <Label>{t("hr.to", "To")}</Label>
                  <Input className="ltr-nums" type="date" value={attTo} onChange={(e) => { setAttTo(e.target.value); setAttPage(1); }} />
                </div>
                <div className="min-w-[10rem] space-y-2">
                  <Label>{t("hr.status")}</Label>
                  <SearchablePickList
                    items={attStatusItems}
                    value={attListStatus}
                    onValueChange={(v) => {
                      setAttListStatus(v);
                      setAttPage(1);
                    }}
                    searchPlaceholder={t("hr.filterStatus", "Filter status…")}
                    placeholder={t("hr.status")}
                  />
                </div>
              </div>
            </div>
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <SortableTh
                      label={t("hr.workDate")}
                      column="workDate"
                      sortBy={attSortBy}
                      sortOrder={attSortOrder}
                      onSort={onAttSort}
                      filterValue={acfDate}
                      onFilterChange={setAcfDate}
                    />
                    <FilterTh label={t("hr.employee")} value={acfEmp} onChange={setAcfEmp} />
                    <FilterTh label={t("hr.clinic")} value={acfClinic} onChange={setAcfClinic} />
                    <SortableTh
                      label={t("hr.status")}
                      column="status"
                      sortBy={attSortBy}
                      sortOrder={attSortOrder}
                      onSort={onAttSort}
                      filterValue={acfStat}
                      onFilterChange={setAcfStat}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filteredAttRows.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-3 py-2 ltr-nums">{a.workDate}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">
                          {a.employeeFirstNameEn || a.employeeLastNameEn
                            ? formatEmployeeName(
                                {
                                  firstNameEn: a.employeeFirstNameEn ?? "",
                                  lastNameEn: a.employeeLastNameEn ?? "",
                                  firstNameAr: a.employeeFirstNameAr,
                                  lastNameAr: a.employeeLastNameAr,
                                },
                                i18n.language,
                              )
                            : (a.employeeFullName ?? "—")}
                        </span>
                        <span className="ms-2 font-mono text-xs text-muted-foreground ltr-nums">
                          {a.employeeNumber ?? a.employeeId.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-start align-middle text-muted-foreground">
                        {formatClinicNameFields(a.clinicNameEn, null, i18n.language)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{formatAttendanceStatus(a.status, t)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
            <TablePagination
              page={attPage}
              pageSize={attPs}
              total={attTotal}
              totalPages={attTotalPages}
              disabled={attendance.isFetching}
              onPageChange={setAttPage}
              onPageSizeChange={(s) => {
                setAttPs(s);
                setAttPage(1);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {tab === "leave" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">{t("hr.leave")}</CardTitle>
            <Dialog open={leaveReqOpen} onOpenChange={setLeaveReqOpen}>
              <DialogTrigger asChild>
                <CreateActionButton type="button">{t("hr.requestLeave")}</CreateActionButton>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>{t("hr.requestLeave")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 pt-2">
                  <div className="space-y-2">
                    <Label required>{t("hr.employee")}</Label>
                    <SearchablePickList
                      items={employeePickItems}
                      value={leaveEmp}
                      onValueChange={setLeaveEmp}
                      searchPlaceholder={t("hr.searchPlaceholder", "Name or number")}
                      placeholder={t("hr.pickEmployee")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("hr.leaveType")}</Label>
                    <SearchablePickList
                      items={leaveTypeItems}
                      value={leaveType}
                      onValueChange={setLeaveType}
                      searchPlaceholder={t("hr.filterLeaveType", "Filter leave type…")}
                      placeholder={t("hr.leaveType")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("hr.start")}</Label>
                    <Input className="ltr-nums" type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("hr.end")}</Label>
                    <Input className="ltr-nums" type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
                  </div>
                  <CreateActionButton type="button" disabled={createLeave.isPending} onClick={handleCreateLeave}>
                    {t("hr.submitLeave")}
                  </CreateActionButton>
                  {leaveValidation.formErr ? <p className="text-sm text-destructive">{leaveValidation.formErr}</p> : null}
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1 space-y-2">
                <Label>{t("hr.filterEmployee", "Filter employee")}</Label>
                <SearchablePickList
                  items={[{ value: "", label: t("hr.anyEmployee", "Any") }, ...employeePickItems]}
                  value={leaveListEmp}
                  onValueChange={(v) => {
                    setLeaveListEmp(v);
                    setLeavePage(1);
                  }}
                  searchPlaceholder={t("hr.searchPlaceholder", "Name or number")}
                  placeholder={t("hr.employee")}
                />
              </div>
              <div className="min-w-[10rem] space-y-2">
                <Label>{t("hr.status")}</Label>
                <SearchablePickList
                  items={leaveStatusItems}
                  value={leaveListStatus}
                  onValueChange={(v) => {
                    setLeaveListStatus(v);
                    setLeavePage(1);
                  }}
                  searchPlaceholder={t("hr.filterStatus", "Filter status…")}
                  placeholder={t("hr.status")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.startFrom", "Start from")}</Label>
                <Input className="ltr-nums" type="date" value={leaveFrom} onChange={(e) => { setLeaveFrom(e.target.value); setLeavePage(1); }} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.startTo", "Start to")}</Label>
                <Input className="ltr-nums" type="date" value={leaveTo} onChange={(e) => { setLeaveTo(e.target.value); setLeavePage(1); }} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={!lcfType.trim() && !lcfDates.trim() && !lcfStat.trim()}
                onClick={() => {
                  setLcfType("");
                  setLcfDates("");
                  setLcfStat("");
                }}
              >
                {t("patients.clearColFilters", "Clear column filters")}
              </Button>
            </div>
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <SortableTh
                      label={t("hr.leaveType")}
                      column="type"
                      sortBy={leaveSortBy}
                      sortOrder={leaveSortOrder}
                      onSort={onLeaveSort}
                      filterValue={lcfType}
                      onFilterChange={setLcfType}
                    />
                    <SortableTh
                      label={t("hr.dates")}
                      column="startDate"
                      sortBy={leaveSortBy}
                      sortOrder={leaveSortOrder}
                      onSort={onLeaveSort}
                      filterValue={lcfDates}
                      onFilterChange={setLcfDates}
                    />
                    <SortableTh
                      label={t("hr.status")}
                      column="status"
                      sortBy={leaveSortBy}
                      sortOrder={leaveSortOrder}
                      onSort={onLeaveSort}
                      filterValue={lcfStat}
                      onFilterChange={setLcfStat}
                    />
                    <th className="align-top px-2 py-2 text-xs font-medium text-muted-foreground">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaveRows.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2">{formatLeaveType(l.type, t)}</td>
                      <td className="px-3 py-2 ltr-nums text-xs">
                        {l.startDate} → {l.endDate}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={l.status === "APPROVED" ? "default" : "secondary"}
                          className={l.status === "REJECTED" ? "border-destructive/60 text-destructive" : undefined}
                        >
                          {formatLeaveStatus(l.status, t)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-end">
                        {l.status === "PENDING" ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" onClick={() => leaveStatus.mutate({ id: l.id, status: "APPROVED" })}>
                              {t("hr.approve")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => leaveStatus.mutate({ id: l.id, status: "REJECTED" })}>
                              {t("hr.reject")}
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
            <TablePagination
              page={leavePage}
              pageSize={leavePs}
              total={leaveTotal}
              totalPages={leaveTotalPages}
              disabled={leave.isFetching}
              onPageChange={setLeavePage}
              onPageSizeChange={(s) => {
                setLeavePs(s);
                setLeavePage(1);
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
