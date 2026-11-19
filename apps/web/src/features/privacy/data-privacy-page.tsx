import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost } from "@/lib/http";

export function DataPrivacyPage() {
  const { t } = useTranslation();
  const exportMut = useMutation({
    mutationFn: () => apiPost<{ id: string; status: string; downloadToken?: string }>("/api/v1/exports/tenant", {}),
  });
  return (
    <div className="space-y-4" data-testid="data-privacy-page">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{t("privacy.title", "Data & privacy")}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("privacy.exportTitle", "Export clinic data")}</CardTitle>
          <CardDescription>
            {t("privacy.exportHint", "Download patients, encounters and invoices as CSV (available while suspended).")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button type="button" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            {t("privacy.exportCta", "Request export")}
          </Button>
          {exportMut.data ? (
            <p className="text-sm text-muted-foreground ltr-nums">
              {exportMut.data.status} · {exportMut.data.id}
              {exportMut.data.downloadToken
                ? ` · token ${exportMut.data.downloadToken.slice(0, 8)}…`
                : null}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
