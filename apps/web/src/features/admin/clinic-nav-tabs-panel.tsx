import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useUsersQuery } from "@/lib/api-hooks";
import { ApiError, apiGet, apiPut } from "@/lib/http";
import type { NavItemKey } from "@/lib/nav-policy";
import { navKeysForRole, orderedNavKeysForRole } from "@/lib/nav-policy";
import { mapApiRole } from "@/lib/roles";
import { formatUserRole } from "@/lib/locale-display";
import type { DemoRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";

const NAV_I18N: Record<NavItemKey, string> = {
  platform: "nav.platformOverview",
  platform_organizations: "nav.platformOrganizations",
  platform_users: "nav.platformUsers",
  platform_clinics: "nav.platformClinics",
  dashboard: "nav.dashboard",
  patients: "nav.patients",
  encounters: "nav.encounters",
  appointments: "nav.appointments",
  operations: "nav.operations",
  clinics: "nav.clinics",
  expenses: "nav.expenses",
  revenue: "nav.revenue",
  hr: "nav.hr",
  reports: "nav.reports",
  admin: "nav.admin",
  doctor_revenue: "nav.doctorRevenue",
  profile: "nav.profile",
};

function fullRoleTabKeysSorted(role: DemoRole): string[] {
  return [...navKeysForRole(role)].sort((a, b) => a.localeCompare(b));
}

export function ClinicNavTabsPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const viewer = useAuthStore((s) => s.user);
  const usersQ = useUsersQuery({ pageSize: 200 });
  const [targetId, setTargetId] = useState("");
  const [draft, setDraft] = useState<Set<NavItemKey>>(() => new Set());
  const [err, setErr] = useState<string | null>(null);

  const pickableUsers = useMemo(() => {
    const items = usersQ.data?.items ?? [];
    if (viewer?.role !== "clinic_admin") return items;
    return items.filter((u) => u.role !== "CLINIC_ADMIN" && u.role !== "GROUP_ADMIN");
  }, [usersQ.data?.items, viewer?.role]);

  const target = pickableUsers.find((u) => u.id === targetId);
  const targetRole = target ? mapApiRole(target.role) : undefined;
  const orderedKeys = useMemo(() => orderedNavKeysForRole(targetRole), [targetRole]);

  const grantQ = useQuery({
    queryKey: ["user-nav-tabs", targetId],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${targetId}`),
    enabled: Boolean(targetId),
  });

  const grantFingerprint = grantQ.data ? JSON.stringify(grantQ.data.tabKeys ?? null) : "";

  useEffect(() => {
    setDraft(new Set());
  }, [targetId]);

  useEffect(() => {
    if (!targetId || !targetRole) return;
    if (!grantQ.isSuccess) return;
    const base = navKeysForRole(targetRole);
    const raw = grantQ.data.tabKeys;
    if (raw == null || raw.length === 0) {
      setDraft(new Set(base));
      return;
    }
    const next = new Set<NavItemKey>();
    for (const k of raw) {
      if (base.has(k as NavItemKey)) next.add(k as NavItemKey);
    }
    next.add("profile");
    setDraft(next);
  }, [targetId, targetRole, grantFingerprint, grantQ.isSuccess]);

  const saveMut = useMutation({
    mutationFn: (tabKeys: string[]) => apiPut<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${targetId}`, { tabKeys }),
    onSuccess: async () => {
      setErr(null);
      await qc.invalidateQueries({ queryKey: ["user-nav-tabs", targetId] });
      if (targetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const toggle = (key: NavItemKey) => {
    if (key === "profile") return;
    setDraft((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      n.add("profile");
      return n;
    });
  };

  const isFullRole =
    targetRole &&
    draft.size === navKeysForRole(targetRole).size &&
    [...navKeysForRole(targetRole)].every((k) => draft.has(k));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.navTabsTitle", "Sidebar tabs per user")}</CardTitle>
        <CardDescription>
          {t(
            "admin.navTabsSubtitle",
            "Choose an employee and tick which sections appear in their sidebar. Profile always stays on. Clear override to restore their role defaults."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nav-tabs-user">{t("admin.navTabsUser", "User")}</Label>
          <select
            id="nav-tabs-user"
            className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setErr(null);
            }}
          >
            <option value="">{t("admin.navTabsPickUser", "Select a user…")}</option>
            {pickableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email}) · {formatUserRole(mapApiRole(u.role), t)}
              </option>
            ))}
          </select>
        </div>

        {usersQ.isError ? (
          <p className="text-sm text-destructive">{usersQ.error instanceof Error ? usersQ.error.message : t("common.error")}</p>
        ) : null}
        {grantQ.isError ? (
          <p className="text-sm text-destructive">{grantQ.error instanceof Error ? grantQ.error.message : t("common.error")}</p>
        ) : null}
        {err ? <p className="text-sm text-destructive">{err}</p> : null}

        {targetId && targetRole ? (
          <div className="space-y-3">
            {grantQ.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {orderedKeys.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={draft.has(key)}
                    disabled={key === "profile" || grantQ.isPending}
                    onChange={() => toggle(key)}
                  />
                  <span>{t(NAV_I18N[key])}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isFullRole || !grantQ.isSuccess
                ? t("admin.navTabsFullRoleHint", "Saving with all tabs checked removes the custom override.")
                : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!targetId || saveMut.isPending || grantQ.isPending}
                onClick={() => {
                  if (!targetRole) return;
                  const keys = [...draft].sort((a, b) => a.localeCompare(b));
                  saveMut.mutate(keys);
                }}
              >
                {t("admin.navTabsSave", "Save tabs")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!targetId || !targetRole || saveMut.isPending || grantQ.isPending}
                onClick={() => {
                  if (!targetRole) return;
                  saveMut.mutate(fullRoleTabKeysSorted(targetRole));
                }}
              >
                {t("admin.navTabsReset", "Use role defaults")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
