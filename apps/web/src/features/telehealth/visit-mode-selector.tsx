import { Video, Hospital } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/http";
import { cn } from "@/lib/utils";

export type VisitMode = "IN_CLINIC" | "TELEHEALTH";

/** Visit-type selector for the create/edit form. Renders nothing when flag/entitlement is off or the doctor does not offer telehealth. */
export function VisitModeSelector({ clinicianId, value, onChange, allowCurrentTelehealth }: { clinicianId: string; value: VisitMode; onChange: (v: VisitMode) => void; allowCurrentTelehealth?: boolean }) {
  const { t } = useTranslation();
  const offer = useQuery({
    queryKey: ["telehealth-offer", clinicianId],
    enabled: Boolean(clinicianId),
    queryFn: () => apiGet<{ enabled: boolean; available: boolean }>(`/api/v1/telehealth/offer/${clinicianId}`),
    staleTime: 60_000,
  });
  if (!clinicianId || (!offer.data?.available && !(allowCurrentTelehealth && value === "TELEHEALTH"))) return null;
  const opt = (v: VisitMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      data-testid={`visit-mode-${v.toLowerCase()}`}
      onClick={() => onChange(v)}
      className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm", value === v ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50")}
    >
      {icon}{label}
    </button>
  );
  return (
    <div className="space-y-2" role="radiogroup" aria-label={t("telehealth.visitMode.label", "Visit type")}>
      <Label>{t("telehealth.visitMode.label", "Visit type")}</Label>
      <div className="flex gap-2">
        {opt("IN_CLINIC", t("telehealth.visitMode.inClinic", "In clinic"), <Hospital className="h-4 w-4" />)}
        {opt("TELEHEALTH", t("telehealth.visitMode.telehealth", "Telehealth (video)"), <Video className="h-4 w-4" />)}
      </div>
      {value === "TELEHEALTH" ? <p className="text-xs text-muted-foreground">{t("telehealth.visitMode.hint", "The patient phone number is required: the video link is sent to it. Email is optional.")}</p> : null}
    </div>
  );
}
