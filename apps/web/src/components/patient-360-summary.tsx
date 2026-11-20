import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { StatusChip } from "@/brand/ui-kit";
import { Skeleton } from "@/components/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allergyLabel, type PatientAllergyCode } from "@/lib/patient-allergies";
import { apiGet } from "@/lib/http";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";

type Summary = {
  allergies: { code: string; otherComment?: string | null }[];
  activeProblems: { id: string; labelEn: string; labelAr?: string | null; icd10Code?: string | null }[];
  currentMedications: { drugName: string; dosage?: string | null; frequency?: string | null }[];
  lastVitals: {
    heartRate?: number | null;
    bpSystolic?: number | null;
    bpDiastolic?: number | null;
    spo2?: number | null;
  } | null;
  alerts: { kind: string; messageEn: string; messageAr: string }[];
  outstandingBalance: number;
  outstandingBalanceCurrency?: string;
  outstandingBalances?: { currency: string; amount: number }[];
  upcomingAppointments: { id: string; startsAt: string; clinicianName: string; typeName?: string | null }[];
  pendingFollowUps: { encounterId: string; dueAt?: string | null; note?: string | null }[];
};

export function Patient360Summary({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const orgCurrency = useOrgBaseCurrency();
  const locale = localeForLanguage(i18n.language);
  const q = useQuery({
    queryKey: ["patient", patientId, "summary"],
    queryFn: () => apiGet<Summary>(`/api/v1/patients/${patientId}/summary`),
  });

  if (q.isPending) return <Card><CardContent className="grid gap-4 pt-[var(--kx-card-pad)] md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-32" /></div>)}</CardContent></Card>;
  if (q.isError || !q.data) return null;
  const s = q.data;
  const dtf = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const label = "text-xs font-medium uppercase tracking-wider text-muted-foreground rtl:normal-case rtl:tracking-normal";
  const balances =
    s.outstandingBalances && s.outstandingBalances.length > 0
      ? s.outstandingBalances
      : [{ currency: s.outstandingBalanceCurrency ?? orgCurrency, amount: s.outstandingBalance }];
  const owes = balances.some((b) => b.amount > 0);
  const v = s.lastVitals;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("patients.summary360", "Patient summary")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-8 gap-y-5 text-sm md:grid-cols-2 xl:grid-cols-3">
        <section className="space-y-4">
          <div className="space-y-1.5">
            <p className={label}>{t("patients.allergies", "Allergies")}</p>
            <div className="flex flex-wrap gap-1.5">
              {s.allergies.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                s.allergies.map((a, i) => (
                  <StatusChip key={i} tone="bad">
                    {a.code === "OTHER" && a.otherComment ? a.otherComment : allergyLabel(a.code as PatientAllergyCode, t)}
                  </StatusChip>
                ))
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className={label}>{t("patients.activeProblems", "Active problems")}</p>
            <ul className="space-y-1">
              {s.activeProblems.length === 0 ? (
                <li className="text-muted-foreground">—</li>
              ) : (
                s.activeProblems.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2">
                    <span>{isAr && p.labelAr ? p.labelAr : p.labelEn}</span>
                    {p.icd10Code ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground ltr-nums">{p.icd10Code}</span> : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
        <section className="space-y-4">
          <div className="space-y-1.5">
            <p className={label}>{t("patients.lastVitals", "Last vitals")}</p>
            {v ? (
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["BP", v.bpSystolic != null && v.bpDiastolic != null ? `${v.bpSystolic}/${v.bpDiastolic}` : null],
                  ["HR", v.heartRate != null ? String(v.heartRate) : null],
                  ["SpO₂", v.spo2 != null ? `${v.spo2}%` : null],
                ].map(([k, val]) => (
                  <div key={k} className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2">
                    <div className="text-[11px] font-medium text-muted-foreground">{k}</div>
                    <div className="text-base font-semibold tabular-nums ltr-nums">{val ?? "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div className="space-y-1.5">
            <p className={label}>{t("patients.currentMeds", "Current medications")}</p>
            <ul className="space-y-1">
              {(s.currentMedications ?? []).slice(0, 6).map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.drugName}</span>
                  {m.dosage ? <span className="text-muted-foreground"> · {m.dosage}</span> : null}
                </li>
              ))}
              {s.currentMedications.length === 0 ? <li className="text-muted-foreground">—</li> : null}
            </ul>
          </div>
        </section>
        <section className="space-y-4">
          <div className="space-y-1.5">
            <p className={label}>{t("patients.alerts", "Alerts")}</p>
            <ul className="space-y-1">
              {s.alerts.map((a, i) => (
                <li key={i}><StatusChip tone="warn">{isAr ? a.messageAr : a.messageEn}</StatusChip></li>
              ))}
              {s.alerts.length === 0 ? <li className="text-muted-foreground">{t("patients.noAlerts", "None")}</li> : null}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className={label}>{t("patients.outstandingBalance", "Outstanding balance")}</p>
            <ul>
              {balances.map((row) => (
                <li key={row.currency} className={`text-lg font-semibold tabular-nums ltr-nums ${owes && row.amount > 0 ? "text-[hsl(var(--warning))]" : ""}`}>
                  {formatMoneyAmount(row.amount, row.currency, locale)}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className={label}>{t("patients.upcomingAppts", "Upcoming appointments")}</p>
            <ul className="space-y-1">
              {s.upcomingAppointments.map((a) => (
                <li key={a.id}>
                  <Link className="group flex items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-1.5 transition-colors hover:border-primary/30 hover:bg-accent/40" to={`/appointments/${a.id}`}>
                    <span className="tabular-nums ltr-nums">{dtf.format(new Date(a.startsAt))}</span>
                    <span className="truncate text-xs text-muted-foreground">{a.clinicianName}</span>
                  </Link>
                </li>
              ))}
              {s.upcomingAppointments.length === 0 ? <li className="text-muted-foreground">—</li> : null}
            </ul>
          </div>
          {s.pendingFollowUps.length > 0 ? (
            <div className="space-y-1.5">
              <p className={label}>{t("patients.pendingFollowUps", "Pending follow-ups")}</p>
              <ul className="space-y-1">
                {s.pendingFollowUps.map((f) => (
                  <li key={f.encounterId}>
                    <Link to={`/encounters/${f.encounterId}`} className="text-primary hover:underline">
                      {f.dueAt ? new Date(f.dueAt).toLocaleDateString(locale) : t("encounters.followUp", "Follow-up")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
