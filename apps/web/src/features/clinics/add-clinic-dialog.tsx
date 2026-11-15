import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PickListItem } from "@/components/searchable-pick-list";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { collectClinicFormIssues } from "@/lib/create-form-validation";
import { apiPatch, apiPost } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";
import { useTenantMarket } from "@/lib/use-tenant-market";
import { ClinicFormFields } from "./clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm } from "./clinic-form-utils";
import { isRootClinic } from "@/lib/clinic-kind";

type AddClinicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type WizardStep = "details" | "tax" | "done";

type TaxChoice = "virtual" | "physical" | "skip";

type CreateClinicResponse = {
  id: string;
  fiscalDevice?: { id: string; serialNumber: string; kind: string; status: string; isDefault: boolean };
};

export function AddClinicDialog({ open, onOpenChange }: AddClinicDialogProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const orgBaseCurrency = useOrgBaseCurrency();
  const { data: clinics = [] } = useClinicsQuery();
  const { data: market } = useTenantMarket();

  const [form, setForm] = useState(() => emptyClinicForm(orgBaseCurrency));
  const [step, setStep] = useState<WizardStep>("details");
  const [taxChoice, setTaxChoice] = useState<TaxChoice>("virtual");
  const [physicalSerial, setPhysicalSerial] = useState("");
  const [physicalModel, setPhysicalModel] = useState("");
  const [credForm, setCredForm] = useState<Record<string, string>>({});
  const [createdClinicId, setCreatedClinicId] = useState<string | null>(null);
  const [createdSerial, setCreatedSerial] = useState<string | null>(null);
  const [createdDeviceId, setCreatedDeviceId] = useState<string | null>(null);

  const validation = useValidationIssuesDialog({ intent: "create" });

  const requiresTax = Boolean(market?.fiscalDeviceRegistration?.required);
  const credentialFields = market?.fiscalDeviceRegistration?.credentialFields ?? [];
  const registrationGuideKey = market?.fiscalDeviceRegistration?.registrationGuideKey;

  const parentClinicPickItems: PickListItem[] = useMemo(
    () =>
      clinics.filter(isRootClinic).map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );

  const resetWizard = () => {
    validation.clear();
    setForm(emptyClinicForm(orgBaseCurrency));
    setStep("details");
    setTaxChoice("virtual");
    setPhysicalSerial("");
    setPhysicalModel("");
    setCredForm({});
    setCreatedClinicId(null);
    setCreatedSerial(null);
    setCreatedDeviceId(null);
  };

  const createClinicMut = useMutation({
    mutationFn: async () => {
      const clinic = await apiPost<CreateClinicResponse>("/api/v1/clinics", clinicFormToCreatePayload(form, { orgBaseCurrency }));
      let deviceId = clinic.fiscalDevice?.id ?? null;
      let serial = clinic.fiscalDevice?.serialNumber ?? null;

      if (requiresTax && taxChoice === "physical") {
        const serialNo = physicalSerial.trim();
        if (!serialNo) throw new Error(t("fiscalDevices.physicalSerialRequired", "Enter the POS serial number"));
        const physical = await apiPost<{ id: string; serialNumber: string }>(`/api/v1/clinics/${clinic.id}/fiscal-devices`, {
          kind: "PHYSICAL",
          serialNumber: serialNo,
          deviceModel: physicalModel.trim() || undefined,
          label: serialNo,
        });
        await apiPatch(`/api/v1/fiscal-devices/${physical.id}`, { isDefault: true });
        deviceId = physical.id;
        serial = physical.serialNumber;
      }

      const hasCreds = credentialFields.some((f) => credForm[f.key]?.trim());
      if (deviceId && hasCreds && taxChoice !== "skip") {
        await apiPost(`/api/v1/fiscal-devices/${deviceId}/credentials`, credForm);
      }

      return { clinic, deviceId, serial };
    },
    onSuccess: ({ clinic, serial, deviceId }) => {
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      setCreatedClinicId(clinic.id);
      setCreatedSerial(serial);
      setCreatedDeviceId(deviceId);
      if (requiresTax) {
        setStep("done");
      } else {
        resetWizard();
        onOpenChange(false);
      }
    },
    onError: (e: unknown) => validation.showError(e),
  });

  const handleNextFromDetails = () => {
    if (createClinicMut.isPending) return;
    const issues = collectClinicFormIssues(form, t);
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    if (requiresTax) setStep("tax");
    else createClinicMut.mutate();
  };

  const handleCreateFromTax = () => {
    if (createClinicMut.isPending) return;
    if (taxChoice === "physical" && !physicalSerial.trim()) {
      validation.showIssues([t("fiscalDevices.physicalSerialRequired", "Enter the POS serial number")]);
      return;
    }
    createClinicMut.mutate();
  };

  const handleCloseDone = () => {
    resetWizard();
    onOpenChange(false);
  };

  const copySerial = async () => {
    if (!createdSerial) return;
    try {
      await navigator.clipboard.writeText(createdSerial);
      toast.success(t("fiscalDevices.copied", "Copied"));
    } catch {
      toast.error(t("common.copyFailed", "Could not copy"));
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) resetWizard();
        }}
      >
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-[36rem]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {step === "tax"
                ? t("fiscalDevices.taxReceiptsStepTitle", "Tax receipts")
                : step === "done"
                  ? t("admin.addClinicDialogTitle", "Add clinic")
                  : t("admin.addClinicDialogTitle", "Add clinic")}
            </DialogTitle>
          </DialogHeader>

          {step === "details" ? (
            <>
              <ClinicFormFields
                idPrefix="add-clinic"
                values={form}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                showParentPicker
                parentClinicItems={parentClinicPickItems}
              />
              {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button type="button" disabled={createClinicMut.isPending} onClick={handleNextFromDetails}>
                  {requiresTax ? t("common.next", "Next") : t("admin.saveClinic", "Save clinic")}
                </Button>
              </div>
            </>
          ) : null}

          {step === "tax" ? (
            <div className="grid gap-4">
              <fieldset className="grid gap-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="taxChoice"
                    className="mt-1"
                    checked={taxChoice === "virtual"}
                    onChange={() => setTaxChoice("virtual")}
                  />
                  <span className="text-sm">{t("fiscalDevices.taxReceiptsVirtual", "Use Kiorly as this clinic's POS (recommended)")}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="taxChoice"
                    className="mt-1"
                    checked={taxChoice === "physical"}
                    onChange={() => setTaxChoice("physical")}
                  />
                  <span className="text-sm">{t("fiscalDevices.taxReceiptsPhysical", "This clinic has its own POS device")}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="taxChoice"
                    className="mt-1"
                    checked={taxChoice === "skip"}
                    onChange={() => setTaxChoice("skip")}
                  />
                  <span className="text-sm">{t("fiscalDevices.taxReceiptsSkip", "Skip for now")}</span>
                </label>
              </fieldset>

              {taxChoice === "physical" ? (
                <div className="grid gap-2">
                  <Label>{t("fiscalDevices.colSerial", "Serial")}</Label>
                  <Input value={physicalSerial} onChange={(e) => setPhysicalSerial(e.target.value)} className="font-mono text-sm" />
                  <Label optional>{t("fiscalDevices.deviceModel", "Device model")}</Label>
                  <Input value={physicalModel} onChange={(e) => setPhysicalModel(e.target.value)} />
                </div>
              ) : null}

              {taxChoice !== "skip" && credentialFields.length > 0 ? (
                <div className="grid gap-2 border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    {registrationGuideKey
                      ? t(registrationGuideKey, t("fiscalDevices.registrationGuide", "Register this serial on your tax authority portal and link it to this branch, then enter the client ID and secret here."))
                      : t("fiscalDevices.registrationGuide", "Register this serial on your tax authority portal and link it to this branch, then enter the client ID and secret here.")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("fiscalDevices.credentialsOptionalNow", "You can enter credentials now or later in clinic settings.")}</p>
                  {credentialFields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label optional>{t(field.labelKey, field.key)}</Label>
                      <Input
                        type={field.type === "password" ? "password" : "text"}
                        autoComplete="off"
                        value={credForm[field.key] ?? ""}
                        onChange={(e) => setCredForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setStep("details")}>
                  {t("common.back", "Back")}
                </Button>
                <Button type="button" disabled={createClinicMut.isPending} onClick={handleCreateFromTax}>
                  {t("admin.saveClinic", "Save clinic")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t("admin.clinicCreated", "Clinic created.")}</p>
              {createdSerial ? (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{t("fiscalDevices.generatedSerial", "Generated POS serial")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="font-mono text-sm">{createdSerial}</code>
                    <Button type="button" size="icon" variant="ghost" onClick={() => void copySerial()}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
              {createdClinicId && createdDeviceId && taxChoice !== "skip" ? (
                <p className="text-sm">
                  {t("fiscalDevices.finishInSettings", "Finish portal registration any time under Settings → Receipt devices.")}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button type="button" onClick={handleCloseDone}>
                  {t("common.done", "Done")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}