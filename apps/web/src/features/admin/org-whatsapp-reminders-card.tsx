import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOverviewQuery } from "@/lib/api-hooks";
import { ApiError, apiPatch } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

export function OrgWhatsAppRemindersCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshSession = useAuthStore((s) => s.refreshSessionFromServer);
  const overview = useAdminOverviewQuery();
  const tenant = overview.data?.currentTenant;

  const [enabled, setEnabled] = useState(false);
  const [reminderHours, setReminderHours] = useState("24");

  useSyncOnChange([tenant], () => {
    const row = tenant as
      | { whatsAppRemindersEnabled?: boolean; appointmentReminderHoursBefore?: number }
      | undefined;
    if (!row) return;
    if (row.whatsAppRemindersEnabled != null) setEnabled(row.whatsAppRemindersEnabled);
    if (row.appointmentReminderHoursBefore != null) setReminderHours(String(row.appointmentReminderHoursBefore));
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const hours = Number.parseInt(reminderHours, 10);
      return apiPatch("/api/v1/admin/tenant-settings", {
        whatsAppRemindersEnabled: enabled,
        appointmentReminderHoursBefore: Number.isFinite(hours) ? hours : 24,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      await refreshSession();
      toast.success(t("admin.whatsappRemindersSaved", "WhatsApp reminder settings saved."));
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        toast.error(String((e.body as { message?: unknown }).message));
      } else toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{t("admin.whatsappReminders", "WhatsApp appointment reminders")}</CardTitle>
          <CardDescription>
            {t(
              "admin.whatsappRemindersCardDesc",
              "Scheduled WhatsApp messages for confirmed appointments. Requires BSP credentials configured for the deployment.",
            )}
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "default" : "outline"}
          aria-pressed={enabled}
          data-setup-target="whatsapp_reminders"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? t("platform.flagOn", "On") : t("platform.flagOff", "Off")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t(
                "admin.whatsappRemindersEnabled",
                "Send async WhatsApp reminders for confirmed appointments",
              )}
            </p>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="whatsapp-reminder-hours">{t("admin.reminderHoursBefore", "Hours before appointment")}</Label>
              <Input
                id="whatsapp-reminder-hours"
                className="ltr-nums w-28"
                type="number"
                min={1}
                max={168}
                value={reminderHours}
                onChange={(e) => setReminderHours(e.target.value)}
              />
            </div>
          </>
        ) : (
          <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t(
              "admin.whatsappRemindersOffHint",
              "Reminders are off. Turn on to queue WhatsApp messages before each confirmed appointment.",
            )}
          </p>
        )}

        <Button
          type="button"
          disabled={
            saveMut.isPending ||
            (enabled && (reminderHours === "" || Number.isNaN(Number.parseInt(reminderHours, 10))))
          }
          onClick={() => saveMut.mutate()}
        >
          {t("common.save", "Save")}
        </Button>
      </CardContent>
    </Card>
  );
}