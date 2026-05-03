import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useEmployeeQuery } from "@/lib/api-hooks";
import { apiFetchBlob } from "@/lib/http";

export function EmployeeDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { data: emp, isPending, isError, error } = useEmployeeQuery(id);

  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", { style: "currency", currency: "AED" }).format(n);

  if (isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError || !emp) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button variant="outline" asChild>
          <Link to="/hr">{t("hr.backToHr", "Back to HR")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
          <Link to="/hr">← {t("hr.backToHr", "Back to HR")}</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {emp.firstNameEn} {emp.lastNameEn}
        </h1>
        <p className="text-muted-foreground font-mono text-sm ltr-nums">{emp.employeeNumber}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hr.employeeDetails", "Employee details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label={t("hr.clinic")} value={emp.clinicNameEn ?? "—"} />
          <Separator />
          <Row label={t("hr.email")} value={emp.email ?? "—"} />
          <Separator />
          <Row label={t("hr.phone")} value={<span className="ltr-nums">{emp.phone}</span>} />
          <Separator />
          <Row label={t("hr.jobTitle")} value={emp.jobTitle} />
          <Separator />
          <Row label={t("hr.employmentType")} value={<Badge variant="secondary">{emp.employmentType}</Badge>} />
          <Separator />
          <Row label={t("hr.hireDate", "Hire date")} value={<span className="ltr-nums">{emp.hireDate}</span>} />
          <Separator />
          <Row label={t("hr.salaryBase")} value={<span className="ltr-nums">{money(emp.salaryBase)}</span>} />
          {emp.hasIdDoc ? (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("hr.idDocument", "ID / passport")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={async () => {
                    const { blob } = await apiFetchBlob(`/api/v1/hr/employees/${emp.id}/id-document`);
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank", "noopener,noreferrer");
                    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                >
                  {t("hr.downloadIdDoc", "Download")}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value}</span>
    </div>
  );
}
