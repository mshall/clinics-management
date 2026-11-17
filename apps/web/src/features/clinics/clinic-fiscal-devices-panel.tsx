import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiscalRejectedPanel } from "@/features/compliance/fiscal-rejected-panel";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/http";
import { useOrgEtaIntegration } from "@/lib/use-org-eta-integration";

type FiscalDeviceRow = {
  id: string;
  serialNumber: string;
  kind: string;
  status: string;
  label: string | null;
  isDefault: boolean;
  hasCredentials: boolean;
  receiptSequence: number;
  lastSubmittedAt: string | null;
};

type SetupStatus = {
  requiresDevice: boolean;
  ready: boolean;
  etaApiEnvironment?: string;
  deviceRegistration?: {
    required: boolean;
    credentialFields: Array<{ key: string; type: string; labelKey: string }>;
    registrationGuideKey: string;
  } | null;
};

export function ClinicFiscalDevicesPanel({ clinicId }: { clinicId: string }) {
  const { t } = useTranslation();
  const { showEtaUi, isLoading: etaLoading } = useOrgEtaIntegration();
  const qc = useQueryClient();
  const [credDevice, setCredDevice] = useState<FiscalDeviceRow | null>(null);
  const [credForm, setCredForm] = useState<Record<string, string>>({});

  const { data: list } = useQuery({
    queryKey: ["fiscal-devices", clinicId],
    queryFn: () => apiGet<{ devices: FiscalDeviceRow[] }>(`/api/v1/clinics/${clinicId}/fiscal-devices`),
    enabled: showEtaUi,
  });

  const { data: setup } = useQuery({
    queryKey: ["fiscal-devices-setup", clinicId],
    queryFn: () => apiGet<SetupStatus>(`/api/v1/clinics/${clinicId}/fiscal-devices/setup-status`),
    enabled: showEtaUi,
  });

  const fields = setup?.deviceRegistration?.credentialFields ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["fiscal-devices", clinicId] });
    void qc.invalidateQueries({ queryKey: ["fiscal-devices-setup", clinicId] });
  };

  const addVirtual = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/clinics/${clinicId}/fiscal-devices`, { kind: "VIRTUAL", label: t("fiscalDevices.virtualLabel", "Kiorly virtual POS") }),
    onSuccess: () => {
      refresh();
      toast.success(t("fiscalDevices.created", "Receipt device added"));
    },
  });

  const saveCreds = useMutation({
    mutationFn: () => apiPost(`/api/v1/fiscal-devices/${credDevice!.id}/credentials`, credForm),
    onSuccess: () => {
      setCredDevice(null);
      setCredForm({});
      refresh();
      toast.success(t("fiscalDevices.credentialsSaved", "Credentials saved"));
    },
  });

  const testConn = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: boolean; error?: string }>(`/api/v1/fiscal-devices/${id}/test-connection`, {}),
    onSuccess: (res) => {
      if (res.ok) toast.success(t("fiscalDevices.testOk", "Connection OK"));
      else toast.error(res.error ?? t("fiscalDevices.testFail", "Connection failed"));
    },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/fiscal-devices/${id}`, { isDefault: true }),
    onSuccess: refresh,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/fiscal-devices/${id}`),
    onSuccess: refresh,
  });

  if (!etaLoading && !showEtaUi) return null;
  if (!setup?.requiresDevice) return null;

  const devices = list?.devices ?? [];

  return (
  <>
    <FiscalRejectedPanel clinicId={clinicId} />
    {!setup.ready ? (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        {t(
          "fiscalDevices.setupBanner",
          "Tax receipts are queued but not being sent — finish receipt device setup.",
        )}
      </div>
    ) : null}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("fiscalDevices.title", "Receipt devices")}</CardTitle>
        <CardDescription className="space-y-1">
          <span>
            {t("fiscalDevices.subtitle", "Virtual or physical POS devices registered with your tax authority.")}
          </span>
          {setup?.etaApiEnvironment ? (
            <span className="block text-xs">
              {t("fiscalDevices.etaEnvironment", "ETA API environment: {{env}}", {
                env: t(`compliance.etaHealth.env.${setup.etaApiEnvironment}`, setup.etaApiEnvironment),
              })}
            </span>
          ) : null}
          <span className="block text-xs text-muted-foreground">
            {t(
              "fiscalDevices.productionCredsHint",
              "For production cutover, enter each clinic’s live client ID and secret here after the pre-production billing drill.",
            )}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={addVirtual.isPending} onClick={() => addVirtual.mutate()}>
            {t("fiscalDevices.addVirtual", "Add virtual device")}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pe-2">{t("fiscalDevices.colLabel", "Label")}</th>
                <th className="py-2 pe-2">{t("fiscalDevices.colSerial", "Serial")}</th>
                <th className="py-2 pe-2">{t("fiscalDevices.colKind", "Kind")}</th>
                <th className="py-2 pe-2">{t("fiscalDevices.colStatus", "Status")}</th>
                <th className="py-2 pe-2 text-end">{t("fiscalDevices.colActions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-border">
                  <td className="py-2 pe-2">
                    {d.label ?? "—"}
                    {d.isDefault ? <Star className="ms-1 inline size-3.5 text-amber-500" aria-label={t("fiscalDevices.default", "Default")} /> : null}
                  </td>
                  <td className="py-2 pe-2 font-mono text-xs">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(d.serialNumber);
                        toast.success(t("fiscalDevices.copied", "Copied"));
                      }}
                    >
                      {d.serialNumber}
                      <Copy className="size-3.5" />
                    </button>
                  </td>
                  <td className="py-2 pe-2">{d.kind}</td>
                  <td className="py-2 pe-2">
                    <Badge variant={d.status === "ACTIVE" ? "default" : "secondary"}>{d.status}</Badge>
                  </td>
                  <td className="py-2 pe-2 text-end">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCredDevice(d)}>
                        {t("fiscalDevices.credentials", "Credentials")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => testConn.mutate(d.id)}>
                        {t("fiscalDevices.test", "Test")}
                      </Button>
                      {!d.isDefault ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDefault.mutate(d.id)}>
                          {t("fiscalDevices.setDefault", "Set default")}
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => deactivate.mutate(d.id)}>
                        {t("fiscalDevices.deactivate", "Deactivate")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!devices.length ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    {t("fiscalDevices.empty", "No receipt devices yet.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <Dialog open={Boolean(credDevice)} onOpenChange={(o) => !o && setCredDevice(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fiscalDevices.credentialsTitle", "Device credentials")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`cred-${f.key}`}>{t(f.labelKey, f.key)}</Label>
              <Input
                id={`cred-${f.key}`}
                type={f.type === "secret" ? "password" : "text"}
                value={credForm[f.key] ?? ""}
                onChange={(e) => setCredForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <Button type="button" disabled={saveCreds.isPending} onClick={() => saveCreds.mutate()}>
            {t("common.save", "Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}