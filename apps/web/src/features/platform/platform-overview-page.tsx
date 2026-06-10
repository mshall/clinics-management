import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPatch } from "@/lib/http";

type FeatureFlagRow = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
};

export function PlatformOverviewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const flagsQuery = useQuery({
    queryKey: ["platform", "feature-flags"],
    queryFn: () => apiGet<FeatureFlagRow[]>("/api/v1/admin/platform/feature-flags"),
  });

  const flagMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/platform/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "feature-flags"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("platform.featureFlags")}</CardTitle>
        <CardDescription>{t("platform.featureFlagsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {flagsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(flagsQuery.data ?? []).map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div>
                  <span className="font-medium">{f.key}</span>
                  {f.description ? <p className="text-xs text-muted-foreground">{f.description}</p> : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={f.enabled ? "default" : "outline"}
                  disabled={flagMut.isPending}
                  onClick={() => flagMut.mutate({ key: f.key, enabled: !f.enabled })}
                >
                  {f.enabled ? t("platform.flagOn") : t("platform.flagOff")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
