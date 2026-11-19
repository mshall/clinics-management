import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPatch } from "@/lib/http";
import { featureFlagLabel } from "@/lib/feature-flag-labels";

export type TenantFeatureFlagRow = {
  scopes?: string[];
  source?: string;
  awaitingGate?: boolean;
  descriptionAr?: string;
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
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/tenant-feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      void qc.invalidateQueries({ queryKey: ["assistant"] });
    },
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
          const orgScope = f.scopes ? f.scopes.includes("org") : true;
          // An org admin cannot re-enable what platform/market/gate/dependency turned off.
          const blockedAbove = !f.effective && f.source !== undefined && f.source !== "org";
          const desc = i18n.language.startsWith("ar") && f.descriptionAr ? f.descriptionAr : f.description;
          return (
            <div key={f.key} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{featureFlagLabel(t, f.key, f.description)}</span>
                <Badge variant={f.effective ? "default" : "secondary"}>
                  {f.effective ? t("platform.flagOn", "On") : t("platform.flagOff", "Off")}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{f.key}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
              {f.source ? (
                <p className="text-xs text-muted-foreground" data-testid={`flag-source-${f.key}`}>
                  {t("flags.source")}: {t(`flags.source${f.source}`, f.source)}
                </p>
              ) : null}
              {blockedAbove ? <p className="text-xs text-muted-foreground">{t("flags.orgCannotOverride")}</p> : null}
              <p className="text-xs text-muted-foreground">
                {t("admin.flagLayers", "Platform {{g}} · Market {{m}}", {
                  g: f.globalEnabled ? "✓" : "✗",
                  m: f.marketEnabled === null ? "—" : f.marketEnabled ? "✓" : "✗",
                })}
              </p>
              {canEdit && orgScope && !blockedAbove ? (
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