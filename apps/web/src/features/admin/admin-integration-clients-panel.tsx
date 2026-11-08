import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet, apiPost } from "@/lib/http";

const INTEGRATION_SCOPES = ["APPOINTMENTS_READ", "APPOINTMENTS_WRITE"] as const;
type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

type IntegrationClientRow = {
  id: string;
  name: string;
  clientKey: string;
  scopes: string[];
  allowedClinicIds: string[];
  lastUsedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
};

type CreateResponse = {
  bearerToken: string;
  clientKey: string;
  name: string;
  allowedClinicIds: string[];
};

type RotateResponse = {
  bearerToken: string;
  clientKey: string;
};

export function AdminIntegrationClientsPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopeDraft, setScopeDraft] = useState<Set<IntegrationScope>>(
    () => new Set(["APPOINTMENTS_READ", "APPOINTMENTS_WRITE"]),
  );
  const [clinicDraft, setClinicDraft] = useState<Set<string>>(() => new Set());
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const { data: clinics = [] } = useClinicsQuery();

  const clients = useQuery({
    queryKey: ["admin", "integration-clients"],
    queryFn: () => apiGet<IntegrationClientRow[]>("/api/v1/admin/integration-clients"),
  });

  const clinicLabel = useMemo(() => {
    const map = new Map(clinics.map((c) => [c.id, i18n.language.startsWith("ar") ? c.nameAr : c.nameEn]));
    return (id: string) => map.get(id) ?? id;
  }, [clinics, i18n.language]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!scopeDraft.size) {
        throw new Error(t("admin.integrations.scopesRequired", "Select at least one scope"));
      }
      return apiPost<CreateResponse>("/api/v1/admin/integration-clients", {
        name: name.trim(),
        scopes: [...scopeDraft],
        ...(clinicDraft.size ? { allowedClinicIds: [...clinicDraft] } : {}),
      });
    },
    onSuccess: (data) => {
      setRevealedToken(data.bearerToken);
      setName("");
      setClinicDraft(new Set());
      setScopeDraft(new Set(["APPOINTMENTS_READ", "APPOINTMENTS_WRITE"]));
      toast.success(t("admin.integrations.created", "Integration client created"));
      void qc.invalidateQueries({ queryKey: ["admin", "integration-clients"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => apiPost<RotateResponse>(`/api/v1/admin/integration-clients/${id}/rotate-secret`, {}),
    onSuccess: (data) => {
      setRevealedToken(data.bearerToken);
      toast.success(t("admin.integrations.rotated", "Secret rotated"));
      void qc.invalidateQueries({ queryKey: ["admin", "integration-clients"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: boolean }>(`/api/v1/admin/integration-clients/${id}/deactivate`, {}),
    onSuccess: () => {
      toast.success(t("admin.integrations.deactivated", "Client deactivated"));
      void qc.invalidateQueries({ queryKey: ["admin", "integration-clients"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const toggleScope = (scope: IntegrationScope) => {
    setScopeDraft((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const toggleClinic = (clinicId: string) => {
    setClinicDraft((prev) => {
      const next = new Set(prev);
      if (next.has(clinicId)) next.delete(clinicId);
      else next.add(clinicId);
      return next;
    });
  };

  const rows = clients.data ?? [];
  const pending = createMutation.isPending || rotateMutation.isPending || deactivateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.integrations.title", "Integration API clients")}</CardTitle>
        <CardDescription>
          {t(
            "admin.integrations.hint",
            "Issue scoped API tokens for external patient platforms. Staff login and in-clinic flows are unchanged.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="integration-name">{t("admin.integrations.name", "Client name")}</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.integrations.namePh", "Patient portal — production")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("admin.integrations.scopes", "API scopes")}</Label>
            <div className="flex flex-wrap gap-3">
              {INTEGRATION_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={scopeDraft.has(scope)}
                    disabled={pending}
                    onChange={() => toggleScope(scope)}
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          {clinics.length ? (
            <div className="space-y-2">
              <Label>{t("admin.integrations.clinics", "Allowed clinics")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.integrations.clinicsHint", "Leave all unchecked to allow every active clinic in the organization.")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto">
                {clinics.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input shrink-0"
                      checked={clinicDraft.has(c.id)}
                      disabled={pending}
                      onChange={() => toggleClinic(c.id)}
                    />
                    <span className="truncate">{i18n.language.startsWith("ar") ? c.nameAr : c.nameEn}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            disabled={!name.trim() || !scopeDraft.size || pending}
            onClick={() => createMutation.mutate()}
          >
            {t("admin.integrations.create", "Create client")}
          </Button>
        </div>

        {revealedToken ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs text-muted-foreground">
              {t("admin.integrations.tokenOnce", "Copy this bearer token now — it will not be shown again:")}
            </p>
            <input
              type="text"
              className="w-full border rounded-md px-2 py-1.5 font-mono text-xs bg-muted"
              readOnly
              value={revealedToken}
              onFocus={(e) => e.target.select()}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => setRevealedToken(null)}>
              {t("admin.integrations.dismissToken", "Dismiss")}
            </Button>
          </div>
        ) : null}

        {clients.isError ? (
          <p className="text-sm text-destructive">
            {clients.error instanceof Error ? clients.error.message : t("common.error")}
          </p>
        ) : null}

        <ResponsiveTable>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colName", "Name")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colKey", "Client key")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colScopes", "Scopes")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colClinics", "Clinics")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("admin.integrations.colStatus", "Status")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("common.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.clientKey}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.scopes.join(", ")}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {r.allowedClinicIds.length
                      ? r.allowedClinicIds.map((id) => clinicLabel(id)).join(", ")
                      : t("admin.integrations.allClinics", "All clinics")}
                  </td>
                  <td className="px-3 py-2">
                    {r.deactivatedAt
                      ? t("admin.integrations.inactive", "Inactive")
                      : t("admin.integrations.active", "Active")}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {!r.deactivatedAt ? (
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => rotateMutation.mutate(r.id)}
                        >
                          {t("admin.integrations.rotate", "Rotate secret")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  "admin.integrations.deactivateConfirm",
                                  "Deactivate this client? External systems using its token will stop working.",
                                ),
                              )
                            ) {
                              deactivateMutation.mutate(r.id);
                            }
                          }}
                        >
                          {t("admin.integrations.deactivate", "Deactivate")}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!clients.isPending && !rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    {t("admin.integrations.empty", "No integration clients yet.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </CardContent>
    </Card>
  );
}
