import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";

type VersionRow = {
  id: string;
  versionLabel: string;
  sourceName: string;
  sourceLicense: string;
  productCount: number;
  importedAt: string;
  isActive: boolean;
};

export function PlatformDrugDatasetsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [marketCode, setMarketCode] = useState("EG");
  const [versionLabel, setVersionLabel] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceLicense, setSourceLicense] = useState("");
  const [jsonPayload, setJsonPayload] = useState("");

  const versionsQuery = useQuery({
    queryKey: ["platform", "drug-datasets", marketCode],
    queryFn: () => apiGet<VersionRow[]>(`/api/v1/admin/platform/drug-datasets?marketCode=${encodeURIComponent(marketCode)}`),
  });

  const importMut = useMutation({
    mutationFn: () => {
      const products = JSON.parse(jsonPayload) as unknown;
      return apiPost("/api/v1/admin/platform/drug-datasets", {
        marketCode,
        versionLabel,
        sourceName,
        sourceLicense,
        products,
      });
    },
    onSuccess: () => {
      toast.success(t("platformDrugs.importOk"));
      void qc.invalidateQueries({ queryKey: ["platform", "drug-datasets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platformDrugs.title")}</CardTitle>
          <CardDescription>{t("platformDrugs.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("platformDrugs.marketCode")}</Label>
            <Input value={marketCode} onChange={(e) => setMarketCode(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label>{t("platformDrugs.versionLabel")}</Label>
            <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("platformDrugs.sourceName")}</Label>
            <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("platformDrugs.sourceLicense")}</Label>
            <Input value={sourceLicense} onChange={(e) => setSourceLicense(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("platformDrugs.jsonPayload")}</Label>
            <textarea
              className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={jsonPayload}
              onChange={(e) => setJsonPayload(e.target.value)}
              placeholder='[{ "brandNameEn": "...", "form": "tablet", "ingredients": [{ "nameEn": "..." }] }]'
            />
          </div>
          <Button
            type="button"
            disabled={importMut.isPending || !versionLabel.trim() || !jsonPayload.trim()}
            onClick={() => importMut.mutate()}
          >
            {t("platformDrugs.import")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platformDrugs.recentVersions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(versionsQuery.data ?? []).map((v) => (
              <li key={v.id} className="rounded border border-border px-3 py-2">
                <span className="font-medium">{v.versionLabel}</span>
                {v.isActive ? " · active" : ""}
                <p className="text-xs text-muted-foreground">
                  {v.sourceName} · {t("platformDrugs.productCount", { count: v.productCount })}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}