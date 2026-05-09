import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery } from "@/lib/api-hooks";
import type { EmployeeDto } from "@/lib/api-types";
import { ApiError, apiPost, apiPostFormData } from "@/lib/http";

const EMP_TYPES: PickListItem[] = [
  { value: "FULL_TIME", label: "FULL_TIME" },
  { value: "PART_TIME", label: "PART_TIME" },
  { value: "CONTRACTOR", label: "CONTRACTOR" },
  { value: "LOCUM", label: "LOCUM" },
];

export function AdminCreateEmployeePanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const clinicItems: PickListItem[] = useMemo(() => clinics.map((c) => ({ value: c.id, label: c.nameEn })), [clinics]);

  const [empClinic, setEmpClinic] = useState("");
  const [empFn, setEmpFn] = useState("");
  const [empLn, setEmpLn] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empTitle, setEmpTitle] = useState("Staff");
  const [empType, setEmpType] = useState("FULL_TIME");
  const [empSalary, setEmpSalary] = useState("9000");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [empIdDocFile, setEmpIdDocFile] = useState<File | null>(null);

  const createEmp = useMutation({
    mutationFn: async () => {
      const emp = await apiPost<EmployeeDto>("/api/v1/hr/employees", {
        clinicId: empClinic,
        firstNameEn: empFn,
        lastNameEn: empLn,
        email: empEmail || undefined,
        phone: empPhone.replace(/\D/g, ""),
        jobTitle: empTitle,
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
    onSuccess: () => {
      setFormErr(null);
      setEmpIdDocFile(null);
      setEmpFn("");
      setEmpLn("");
      setEmpEmail("");
      setEmpPhone("");
      setEmpClinic("");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.createEmployee", "Create employee")}</CardTitle>
        <CardDescription>
          {t(
            "admin.createEmployeeHint",
            "Employment type, salary, and clinic assignment. Optional ID document upload."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("hr.clinic")}</Label>
            <SearchablePickList
              items={clinicItems}
              value={empClinic}
              onValueChange={setEmpClinic}
              searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
              placeholder={t("hr.pickClinic")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("hr.firstName")}</Label>
            <Input value={empFn} onChange={(e) => setEmpFn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("hr.lastName")}</Label>
            <Input value={empLn} onChange={(e) => setEmpLn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("hr.email")}</Label>
            <Input type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("hr.phone")}</Label>
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
            <Label>{t("hr.employmentType", "Employment type")}</Label>
            <SearchablePickList
              items={EMP_TYPES}
              value={empType}
              onValueChange={setEmpType}
              searchPlaceholder={t("hr.filterEmpType", "Filter type…")}
              placeholder={t("hr.employmentType")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("hr.salaryBase")}</Label>
            <Input className="ltr-nums" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} type="number" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("hr.idDocument", "ID / passport (PDF or image)")}</Label>
            <Input
              className="cursor-pointer text-sm"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setEmpIdDocFile(e.target.files?.[0] ?? null)}
            />
            {empIdDocFile ? <p className="text-xs text-muted-foreground ltr-nums">{empIdDocFile.name}</p> : null}
          </div>
          <div className="flex items-end sm:col-span-2">
            <CreateActionButton
              type="button"
              disabled={!empClinic || !empFn || !empLn || empPhone.replace(/\D/g, "").length < 8 || createEmp.isPending}
              onClick={() => createEmp.mutate()}
            >
              {t("hr.saveEmployee")}
            </CreateActionButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
