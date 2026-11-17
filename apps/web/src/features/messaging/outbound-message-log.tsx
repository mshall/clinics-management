import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, Clock, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { showNavItem } from "@/lib/nav-policy";

export type OutboundMessageRow = {
  id: string;
  channel: string;
  templateKey: string | null;
  body: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  error: string | null;
  failureClass?: string | null;
  createdAt: string;
};

function DeliveryTicks({ row }: { row: OutboundMessageRow }) {
  if (row.status === "FAILED" || row.error) {
    return <XCircle className="size-4 text-destructive" aria-hidden />;
  }
  if (row.readAt) {
    return <CheckCheck className="size-4 text-primary" aria-hidden />;
  }
  if (row.deliveredAt || row.status === "DELIVERED") {
    return <Check className="size-4 text-muted-foreground" aria-hidden />;
  }
  if (row.sentAt || row.status === "SENT") {
    return <Check className="size-4 text-muted-foreground/60" aria-hidden />;
  }
  return <Clock className="size-4 text-muted-foreground/50" aria-hidden />;
}

export function OutboundMessageLog({
  patientId,
  appointmentId,
}: {
  patientId?: string;
  appointmentId?: string;
}) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const planEntitlements = useAuthStore((s) => s.user?.entitlements);
  const planKey = useAuthStore((s) => s.user?.plan?.key ?? null);
  const canMessage =
    showNavItem(role, "appointments", navTabKeys, roleNavTabKeys, undefined, undefined, planEntitlements, planKey) ||
    showNavItem(role, "admin", navTabKeys, roleNavTabKeys, undefined, undefined, planEntitlements, planKey);

  const q = useQuery({
    queryKey: ["messaging", "outbound", patientId, appointmentId],
    enabled: canMessage && Boolean(patientId || appointmentId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (patientId) params.set("patientId", patientId);
      if (appointmentId) params.set("appointmentId", appointmentId);
      return apiGet<OutboundMessageRow[]>(`/api/v1/messaging/outbound?${params.toString()}`);
    },
  });

  if (!canMessage) return null;
  if (!q.data?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("messaging.logTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {q.data.map((row) => (
            <li key={row.id} className="flex items-start gap-2 text-sm">
              <DeliveryTicks row={row} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-foreground">{row.body}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`messaging.status.${row.status}`, row.status)}
                  {row.templateKey ? ` · ${row.templateKey}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}