import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePatientVitalsSeriesQuery } from "@/lib/api-hooks";

type Props = { patientId: string };

export function PatientVitalsCharts({ patientId }: Props) {
  const { t } = useTranslation();
  const { data = [], isPending } = usePatientVitalsSeriesQuery(patientId);

  const chartData = useMemo(
    () =>
      data.map((p) => ({
        at: new Date(p.at).toLocaleDateString(),
        weightKg: p.weightKg,
        heightCm: p.heightCm,
        heartRate: p.heartRate,
        bp: p.bpSystolic != null && p.bpDiastolic != null ? `${p.bpSystolic}/${p.bpDiastolic}` : null,
        bpSys: p.bpSystolic,
        spo2: p.spo2,
      })),
    [data],
  );

  const showGrowth = chartData.some((d) => d.weightKg != null || d.heightCm != null);

  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!chartData.length) {
    return <p className="text-sm text-muted-foreground">{t("patients.noVitalsChart", "No vitals trend data yet.")}</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("patients.vitalsTrend", "Vitals over visits")}</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="at" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="heartRate" name={t("encounters.vitalsHr", "HR")} stroke="var(--chart-1)" dot={false} />
              <Line type="monotone" dataKey="spo2" name={t("encounters.vitalsSpo2", "SpO₂")} stroke="var(--chart-2)" dot={false} />
              <Line type="monotone" dataKey="bpSys" name={t("encounters.vitalsBpSys", "BP sys")} stroke="var(--chart-3)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      {showGrowth ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("patients.growthChart", "Growth (weight & height)")}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="at" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="w" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="h" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="w" type="monotone" dataKey="weightKg" name={t("encounters.vitalsWeight", "Weight kg")} stroke="var(--chart-4)" dot />
                <Line yAxisId="h" type="monotone" dataKey="heightCm" name={t("encounters.vitalsHeight", "Height cm")} stroke="var(--chart-5)" dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
