import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allergyLabel, type PatientAllergyCode } from "@/lib/patient-allergies";
import { apiGet } from "@/lib/http";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";

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
  upcomingAppointments: { id: string; startsAt: string; clinicianName: string; typeName?: string | null }[];
  pendingFollowUps: { encounterId: string; dueAt?: string | null; note?: string | null }[];
};

export function Patient360Summary({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const q = useQuery({
    queryKey: ["patient", patientId, "summary"],
    queryFn: () => apiGet<Summary>(`/api/v1/patients/${patientId}/summary`),
  });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError || !q.data) return null;
  const s = q.data;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("patients.summary360", "Patient summary")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-sm">
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("patients.activeProblems", "Active problems")}</p>
          <ul className="space-y-1">
            {s.activeProblems.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              s.activeProblems.map((p) => (
                <li key={p.id}>
                  {isAr && p.labelAr ? p.labelAr : p.labelEn}
                  {p.icd10Code ? <span className="text-muted-foreground"> ({p.icd10Code})</span> : null}
                </li>
              ))
            )}
          </ul>
          <p className="text-xs font-medium uppercase text-muted-foreground pt-2">{t("patients.allergies", "Allergies")}</p>
          <div className="flex flex-wrap gap-1">
            {s.allergies.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              s.allergies.map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {a.code === "OTHER" && a.otherComment ? a.otherComment : allergyLabel(a.code as PatientAllergyCode, t)}
                </Badge>
              ))
            )}
          </div>
        </section>
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("patients.currentMeds", "Current medications")}</p>
          <ul className="space-y-1">
            {(s.currentMedications ?? []).slice(0, 6).map((m, i) => (
              <li key={i}>
                {m.drugName}
                {m.dosage ? ` · ${m.dosage}` : ""}
              </li>
            ))}
            {s.currentMedications.length === 0 ? <li className="text-muted-foreground">—</li> : null}
          </ul>
          <p className="text-xs font-medium uppercase text-muted-foreground pt-2">{t("patients.lastVitals", "Last vitals")}</p>
          {s.lastVitals ? (
            <p className="ltr-nums">
              {s.lastVitals.bpSystolic != null && s.lastVitals.bpDiastolic != null
                ? `BP ${s.lastVitals.bpSystolic}/${s.lastVitals.bpDiastolic}`
                : null}
              {s.lastVitals.heartRate != null ? ` · HR ${s.lastVitals.heartRate}` : null}
              {s.lastVitals.spo2 != null ? ` · SpO₂ ${s.lastVitals.spo2}%` : null}
            </p>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
        </section>
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("patients.alerts", "Alerts")}</p>
          <ul className="space-y-1">
            {s.alerts.map((a, i) => (
              <li key={i} className="text-amber-900 dark:text-amber-100">
                {isAr ? a.messageAr : a.messageEn}
              </li>
            ))}
            {s.alerts.length === 0 ? <li className="text-muted-foreground">{t("patients.noAlerts", "None")}</li> : null}
          </ul>
          <p className="text-xs font-medium uppercase text-muted-foreground pt-2">{t("patients.outstandingBalance", "Outstanding balance")}</p>
          <p className="font-medium ltr-nums">{formatMoneyAmount(s.outstandingBalance, "AED", localeForLanguage(i18n.language))}</p>
          <p className="text-xs font-medium uppercase text-muted-foreground pt-2">{t("patients.upcomingAppts", "Upcoming appointments")}</p>
          <ul className="space-y-1">
            {s.upcomingAppointments.map((a) => (
              <li key={a.id}>
                <Link className="text-primary hover:underline" to={`/appointments/${a.id}`}>
                  {new Date(a.startsAt).toLocaleString()} · {a.clinicianName}
                </Link>
              </li>
            ))}
            {s.upcomingAppointments.length === 0 ? <li className="text-muted-foreground">—</li> : null}
          </ul>
          {s.pendingFollowUps.length > 0 ? (
            <>
              <p className="text-xs font-medium uppercase text-muted-foreground pt-2">{t("patients.pendingFollowUps", "Pending follow-ups")}</p>
              <ul className="space-y-1">
                {s.pendingFollowUps.map((f) => (
                  <li key={f.encounterId}>
                    <Link to={`/encounters/${f.encounterId}`} className="text-primary hover:underline">
                      {f.dueAt ? new Date(f.dueAt).toLocaleDateString() : t("encounters.followUp", "Follow-up")}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
