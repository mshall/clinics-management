import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/http";
import { canEditPatientDetails } from "@/lib/patient-edit-policy";
import { useAuthStore } from "@/stores/auth-store";

type ConsentRow = {
  channel: "WHATSAPP" | "SMS";
  purpose: "TRANSACTIONAL" | "MARKETING";
  granted: boolean;
  source: string | null;
  updatedAt: string | null;
};

type Props = { patientId: string };

export function PatientMessagingConsentCard({ patientId }: Props) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = canEditPatientDetails(role);
  const qc = useQueryClient();

  const { data: consents = [], isPending } = useQuery({
    queryKey: ["patient-messaging-consent", patientId],
    queryFn: () => apiGet<ConsentRow[]>(`/api/v1/patients/${patientId}/messaging-consent`),
  });

  const save = useMutation({
    mutationFn: (next: ConsentRow[]) =>
      apiPut<ConsentRow[]>(`/api/v1/patients/${patientId}/messaging-consent`, { consents: next }),
    onSuccess: (rows) => {
      qc.setQueryData(["patient-messaging-consent", patientId], rows);
    },
  });

  const toggle = (channel: ConsentRow["channel"], purpose: ConsentRow["purpose"], granted: boolean) => {
    if (!canEdit || save.isPending) return;
    const next = consents.map((c) =>
      c.channel === channel && c.purpose === purpose ? { ...c, granted } : c,
    );
    save.mutate(next);
  };

  const labelFor = (row: ConsentRow) => {
    const ch =
      row.channel === "WHATSAPP"
        ? t("messagingConsent.channelWhatsapp", "WhatsApp")
        : t("messagingConsent.channelSms", "SMS");
    const purp =
      row.purpose === "MARKETING"
        ? t("messagingConsent.purposeMarketing", "Marketing & recalls")
        : t("messagingConsent.purposeTransactional", "Transactional (reminders)");
    return `${ch} · ${purp}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("messagingConsent.title", "Messaging consent")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "messagingConsent.hint",
            "Transactional messages include appointment reminders. Marketing covers recall campaigns. Patients can reply STOP or إلغاء on WhatsApp to opt out.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
        ) : (
          consents.map((row) => (
            <div key={`${row.channel}-${row.purpose}`} className="flex items-center justify-between gap-4">
              <Label htmlFor={`consent-${row.channel}-${row.purpose}`} className="font-normal">
                {labelFor(row)}
              </Label>
              <input
                id={`consent-${row.channel}-${row.purpose}`}
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={row.granted}
                disabled={!canEdit || save.isPending}
                onChange={(e) => toggle(row.channel, row.purpose, e.target.checked)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}