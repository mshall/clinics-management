import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { apiGet } from "@/lib/http";
import { mapApiRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";

type VerificationDto = { status: string; badge?: { verified: boolean; labelEn: string; labelAr: string } };

const tone: Record<string, string> = {
  UNVERIFIED: "bg-muted text-muted-foreground",
  PENDING: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  VERIFIED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  REJECTED: "bg-destructive/15 text-destructive",
  EXPIRED: "bg-orange-500/15 text-orange-800",
};

export function ClinicianVerificationStatusChip() {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const additional = useAuthStore((s) => s.user?.additionalRoles ?? []);
  const isPhysician =
    mapApiRole(role ?? "") === "physician" || additional.some((r) => mapApiRole(r) === "physician");
  const q = useQuery({
    queryKey: ["clinician-verification", "me"],
    queryFn: () => apiGet<VerificationDto>("/api/v1/clinicians/me/verification"),
    enabled: isPhysician,
  });
  if (!isPhysician || !q.data) return null;
  const status = q.data.status;
  return (
    <Badge variant="secondary" className={tone[status] ?? ""}>
      {status === "VERIFIED" && q.data.badge?.verified
        ? i18n.language.startsWith("ar")
          ? q.data.badge.labelAr
          : q.data.badge.labelEn
        : t(`verification.status.${status}`, status)}
    </Badge>
  );
}