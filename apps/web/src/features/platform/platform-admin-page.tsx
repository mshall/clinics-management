import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm, isClinicFormComplete, type ClinicFormValues } from "@/features/clinics/clinic-form-utils";
import { PlatformOrgDetailPanel } from "@/features/platform/platform-org-detail-panel";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/http";
import type { Paginated } from "@/lib/paginated";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

type TenantRow = {
  id: string;
  name: string;
  baseCurrency: string;
  defaultLocale: string;
  createdAt: string;
  counts: { users: number; clinics: number; patients: number };
};

type FeatureFlagRow = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
};

type PlatformOverview = {
  tenantCount: number;
  userCount: number;
  clinicCount: number;
  patientCount: number;
  encounterCount: number;
};

export function PlatformAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPlatform = authUser?.role === "platform_super_admin" || Boolean(authUser?.platformSuperAdmin);

  const [tenantName, setTenantName] = useState("");
  const [tenantCurrency, setTenantCurrency] = useState("AED");
  const [tenantLocale, setTenantLocale] = useState("en");
  const [gaEmail, setGaEmail] = useState("");
  const [gaPassword, setGaPassword] = useState("");
  const [gaName, setGaName] = useState("");
  const [hqForm, setHqForm] = useState<ClinicFormValues>(emptyClinicForm());
  const [createOrgWithHq, setCreateOrgWithHq] = useState(false);
  const [tenantErr, setTenantErr] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => apiGet<PlatformOverview>("/api/v1/admin/platform/overview"),
    enabled: isPlatform,
  });

  const flagsQuery = useQuery({
    queryKey: ["platform", "feature-flags"],
    queryFn: () => apiGet<FeatureFlagRow[]>("/api/v1/admin/platform/feature-flags"),
    enabled: isPlatform,
  });

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<Paginated<TenantRow>>("/api/v1/admin/platform/tenants?page=1&pageSize=100&sortBy=name&sortOrder=asc"),
    enabled: isPlatform,
  });

  const tenantRows = tenantsQuery.data?.items ?? [];

  const createTenantMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: tenantName.trim(),
        baseCurrency: tenantCurrency.trim() || "AED",
        defaultLocale: tenantLocale.trim() || "en",
        groupAdmin: { email: gaEmail.trim(), password: gaPassword, displayName: gaName.trim() },
      };
      if (createOrgWithHq) {
        body.initialClinic = clinicFormToCreatePayload(hqForm, { includeParent: false });
      }
      return apiPost<TenantRow>("/api/v1/admin/platform/tenants", body);
    },
    onSuccess: (row) => {
      setTenantErr(null);
      setTenantName("");
      setGaEmail("");
      setGaPassword("");
      setGaName("");
      setHqForm(emptyClinicForm());
      setCreateOrgWithHq(false);
      setSelectedTenantId(row.id);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setTenantErr(apiErrorMessage(e)),
  });

  const flagMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/platform/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "feature-flags"] }),
  });

  const canCreateOrg =
    tenantName.trim().length > 0 &&
    gaEmail.trim().length > 0 &&
    gaPassword.length >= 8 &&
    gaName.trim().length > 0 &&
    (!createOrgWithHq || isClinicFormComplete(hqForm));

  if (authUser && !isPlatform) {
    return <Navigate to="/" replace />;
  }

  const ov = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("platform.title")}</h1>
        <p className="text-muted-foreground">{t("platform.subtitle")}</p>
      </div>

      {ov ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: t("platform.kpi.orgs"), value: ov.tenantCount },
            { label: t("platform.kpi.users"), value: ov.userCount },
            { label: t("platform.kpi.clinics"), value: ov.clinicCount },
            { label: t("platform.kpi.patients"), value: ov.patientCount },
            { label: t("platform.kpi.encounters"), value: ov.encounterCount },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold ltr-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.createOrg")}</CardTitle>
          <CardDescription>{t("platform.createOrgHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("platform.orgName")}</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Acme Clinic Group" />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.baseCurrency")}</Label>
            <Input value={tenantCurrency} onChange={(e) => setTenantCurrency(e.target.value)} placeholder="AED" />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultLocale")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={tenantLocale}
              onChange={(e) => setTenantLocale(e.target.value)}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>

          <div className="md:col-span-2 rounded-md border border-border p-4 space-y-3">
            <p className="text-sm font-medium">{t("platform.groupAdminSection")}</p>
            <p className="text-xs text-muted-foreground">{t("platform.groupAdminHint")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("platform.groupAdminEmail")}</Label>
                <Input type="email" value={gaEmail} onChange={(e) => setGaEmail(e.target.value)} placeholder="admin@acme.com" />
              </div>
              <div className="space-y-2">
                <Label>{t("auth.password")}</Label>
                <Input type="password" value={gaPassword} onChange={(e) => setGaPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.displayName")}</Label>
                <Input value={gaName} onChange={(e) => setGaName(e.target.value)} placeholder="Acme Group Admin" />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createOrgWithHq} onChange={(e) => setCreateOrgWithHq(e.target.checked)} />
              {t("platform.createInitialHq")}
            </label>
            {createOrgWithHq ? (
              <div className="rounded-md border border-border p-4">
                <ClinicFormFields
                  idPrefix="hq-create"
                  values={hqForm}
                  onChange={(patch) => setHqForm((prev) => ({ ...prev, ...patch }))}
                />
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <Button type="button" disabled={!canCreateOrg || createTenantMut.isPending} onClick={() => createTenantMut.mutate()}>
              {t("platform.createOrgBtn")}
            </Button>
            {tenantErr ? <p className="mt-2 text-sm text-destructive">{tenantErr}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.organizations")}</CardTitle>
          <CardDescription>{t("platform.orgTableHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenantsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("platform.orgName")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.clinics")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.users")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.patients")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-t border-border transition-colors hover:bg-muted/40",
                        selectedTenantId === row.id && "bg-primary/10 hover:bg-primary/15",
                      )}
                      onClick={() => setSelectedTenantId((id) => (id === row.id ? "" : row.id))}
                    >
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.clinics}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.users}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.patients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}

          {selectedTenantId ? <PlatformOrgDetailPanel tenantId={selectedTenantId} /> : null}
        </CardContent>
      </Card>

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
    </div>
  );
}

function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
