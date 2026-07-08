import type { ReactNode } from "react";
import { Briefcase, Building2, Calendar, Mail, Phone, UserCircle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployeeQuery } from "@/lib/api-hooks";
import {
  formatClinicNameFields,
  formatEmploymentType,
  formatUserRole,
  localeForLanguage,
} from "@/lib/locale-display";
import { avatarGradient, profileInitials } from "@/lib/profile-avatar";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";

export function EmployeeProfilePage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { data: emp, isPending, isError, error } = useEmployeeQuery(id);

  const fullName = emp ? `${emp.firstNameEn} ${emp.lastNameEn}` : "";
  const avatarPath = emp?.hasUserAvatar && id ? `/api/v1/hr/employees/${id}/avatar` : null;
  const { url: avatarUrl, loading: avatarLoading } = useAuthenticatedImage(avatarPath, Boolean(emp?.hasUserAvatar));

  const coverStyle = useMemo(
    () => ({ background: avatarGradient(emp?.employeeNumber ?? emp?.id ?? "employee") }),
    [emp?.employeeNumber, emp?.id],
  );
  const avatarStyle = useMemo(
    () => ({ background: avatarGradient(fullName || emp?.id || "avatar") }),
    [fullName, emp?.id],
  );

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), { style: "currency", currency: "AED" }).format(n);

  if (isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError || !emp) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button variant="outline" asChild>
          <Link to="/hr?tab=employees">{t("hr.backToHr", "Back to HR")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="h-auto px-0 text-muted-foreground" asChild>
          <Link to={`/hr/employees/${emp.id}`}>← {t("hr.backToEmployeeDetails", "Back to employee details")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/hr/employees/${emp.id}`}>{t("hr.openEmployeeDetails", "HR record")}</Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <div className="relative h-36 sm:h-44" style={coverStyle} aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
        </div>

        <CardContent className="relative px-4 pb-6 pt-0 sm:px-6">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="size-28 rounded-full border-4 border-card object-cover shadow-lg sm:size-32"
              />
            ) : (
              <div
                className="flex size-28 shrink-0 items-center justify-center rounded-full border-4 border-card text-3xl font-bold text-white shadow-lg sm:size-32"
                style={avatarStyle}
                aria-hidden
              >
                {avatarLoading && emp.hasUserAvatar ? "…" : profileInitials(fullName)}
              </div>
            )}
            <div className="min-w-0 space-y-1 pb-1 sm:pb-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{fullName}</h1>
              <p className="font-mono text-sm text-muted-foreground ltr-nums">{emp.employeeNumber}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary">{emp.jobTitle}</Badge>
                <Badge variant="outline">{formatEmploymentType(emp.employmentType, t)}</Badge>
              </div>
              {emp.linkedUserRole ? (
                <p className="text-sm text-muted-foreground">
                  {t("hr.linkedAccountRole", "Login role")}: {formatUserRole(emp.linkedUserRole, t)}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <ProfileFact icon={Building2} label={t("hr.clinic")} value={formatClinicNameFields(emp.clinicNameEn, null, i18n.language)} />
            <ProfileFact icon={Briefcase} label={t("hr.jobTitle")} value={emp.jobTitle} />
            <ProfileFact icon={Mail} label={t("hr.email")} value={emp.email ?? "—"} />
            <ProfileFact icon={Phone} label={t("hr.phone")} value={<span className="ltr-nums">{emp.phone}</span>} />
            <ProfileFact icon={Calendar} label={t("hr.hireDate")} value={<span className="ltr-nums">{emp.hireDate}</span>} />
            <ProfileFact icon={UserCircle} label={t("hr.salaryBase")} value={<span className="ltr-nums">{money(emp.salaryBase)}</span>} />
          </dl>

          {emp.linkedUserDisplayName ? (
            <p className="mt-5 text-sm text-muted-foreground">
              {t("hr.linkedLoginAccount", "Linked login account")}:{" "}
              <span className="font-medium text-foreground">{emp.linkedUserDisplayName}</span>
            </p>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              {t("hr.noLinkedLoginAccount", "No login account is linked to this employee record yet.")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium">{value}</dd>
    </div>
  );
}
