import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost } from "@/lib/http";
import { useOrgEtaIntegration } from "@/lib/use-org-eta-integration";

type CredRow = {
  id: string;
  providerKey: string;
  clinicId: string | null;
  deviceId: string | null;
  secretRef: string;
  label: string | null;
};

export function ProviderCredentialsPanel() {
  const { t } = useTranslation();
  const { showEtaUi, isLoading: etaLoading } = useOrgEtaIntegration();
  const qc = useQueryClient();
  const [providerKey, setProviderKey] = useState("eta-egypt");
  const [secretRef, setSecretRef] = useState("");
  const [label, setLabel] = useState("");

  const listQ = useQuery({
    queryKey: ["admin", "provider-credentials"],
    queryFn: () => apiGet<CredRow[]>("/api/v1/admin/provider-credentials"),
    enabled: showEtaUi,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/admin/provider-credentials", {
        providerKey: providerKey.trim(),
        secretRef: secretRef.trim(),
        label: label.trim() || undefined,
      }),
    onSuccess: () => {
      setSecretRef("");
      void qc.invalidateQueries({ queryKey: ["admin", "provider-credentials"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/provider-credentials/${encodeURIComponent(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "provider-credentials"] }),
  });

  if (!etaLoading && !showEtaUi) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.providerCredentials", "Provider credentials")}</CardTitle>
        <CardDescription>
          {t(
            "admin.providerCredentialsHint",
            "Store AWS Secrets Manager paths only — never paste API keys into the app.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{t("admin.providerKey", "Provider")}</Label>
            <Input value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder="eta-egypt" />
          </div>
          <div className="md:col-span-2">
            <Label>{t("admin.secretRef", "Secret ref (ARN or path)")}</Label>
            <Input value={secretRef} onChange={(e) => setSecretRef(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="md:col-span-3">
            <Label>{t("admin.labelOptional", "Label")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={createMut.isPending || !providerKey.trim() || secretRef.trim().length < 8}
            onClick={() => createMut.mutate()}
          >
            {t("common.add", "Add")}
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {(listQ.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2">
              <hgroup>
                <p className="font-mono text-xs">{c.providerKey}</p>
                <p className="text-xs text-muted-foreground break-all">{c.secretRef}</p>
              </hgroup>
              <Button type="button" size="sm" variant="outline" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(c.id)}>
                {t("common.remove", "Remove")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}