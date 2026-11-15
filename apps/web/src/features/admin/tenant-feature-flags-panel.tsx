import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPatch } from "@/lib/http";

export type TenantFeatureFlagRow = {
  key: string;
  description: string;
  globalEnabled: boolean;
  marketEnabled: boolean | null;
  tenantEnabled: boolean | null;
  effective: boolean;
};

export function TenantFeatureFlagsPanel({
  flags,
  canEdit,
}: {
  flags: TenantFeatureFlagRow[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/tenant-feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "overview"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.orgFeatureFlags", "Organization feature flags")}</CardTitle>
        <CardDescription>
          {t(
            "admin.orgFeatureFlagsHint",
            "Overrides apply on top of your country market pack and platform master switches.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {flags.map((f) => {
          const orgOn = f.tenantEnabled ?? f.effective;
          return (
            <div key={f.key} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{f.key}</span>
                <Badge variant={f.effective ? "default" : "secondary"}>
                  {f.effective ? t("platform.flagOn", "On") : t("platform.flagOff", "Off")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{f.description}</p>
              <p className="text-xs text-muted-foreground">
                {t("admin.flagLayers", "Platform {{g}} · Market {{m}}", {
                  g: f.globalEnabled ? "✓" : "✗",
                  m: f.marketEnabled === null ? "—" : f.marketEnabled ? "✓" : "✗",
                })}
              </p>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ key: f.key, enabled: !orgOn })}
                >
                  {orgOn ? t("admin.turnOffOrg", "Turn off for org") : t("admin.turnOnOrg", "Turn on for org")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}