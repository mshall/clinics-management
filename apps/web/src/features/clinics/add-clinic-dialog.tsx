import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PickListItem } from "@/components/searchable-pick-list";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { collectClinicFormIssues } from "@/lib/create-form-validation";
import { apiPost } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import { ClinicFormFields } from "./clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm } from "./clinic-form-utils";
import { isRootClinic } from "@/lib/clinic-kind";

type AddClinicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddClinicDialog({ open, onOpenChange }: AddClinicDialogProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();

  const [form, setForm] = useState(emptyClinicForm());
  const validation = useValidationIssuesDialog({ intent: "create" });

  const parentClinicPickItems: PickListItem[] = useMemo(
    () =>
      clinics.filter(isRootClinic).map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );

  const createClinicMut = useMutation({
    mutationFn: () => apiPost("/api/v1/clinics", clinicFormToCreatePayload(form)),
    onSuccess: () => {
      validation.clear();
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      setForm(emptyClinicForm());
      onOpenChange(false);
    },
    onError: (e: unknown) => validation.showError(e),
  });

  const handleSave = () => {
    if (createClinicMut.isPending) return;
    const issues = collectClinicFormIssues(form, t);
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    createClinicMut.mutate();
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          validation.clear();
          setForm(emptyClinicForm());
        }
      }}
    >
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-[36rem]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("admin.addClinicDialogTitle", "Add clinic")}</DialogTitle>
        </DialogHeader>
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
          <Button type="button" disabled={createClinicMut.isPending} onClick={handleSave}>
            {t("admin.saveClinic", "Save clinic")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}
