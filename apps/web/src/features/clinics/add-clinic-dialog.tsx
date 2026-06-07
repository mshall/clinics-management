import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import { ClinicFormFields } from "./clinic-form-fields";
import { clinicFormToCreatePayload, emptyClinicForm, isClinicFormComplete } from "./clinic-form-utils";

type AddClinicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddClinicDialog({ open, onOpenChange }: AddClinicDialogProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();

  const [form, setForm] = useState(emptyClinicForm);
  const [clinicErr, setClinicErr] = useState<string | null>(null);

  const parentClinicPickItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("admin.newParentClinic", "None — create as parent clinic") },
      ...clinics.filter((c) => c.kind === "parent").map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    ],
    [clinics, t, i18n.language],
  );

  const createClinicMut = useMutation({
    mutationFn: () => apiPost("/api/v1/clinics", clinicFormToCreatePayload(form)),
    onSuccess: () => {
      setClinicErr(null);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      setForm(emptyClinicForm());
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setClinicErr(String((e.body as { message?: unknown }).message));
      } else setClinicErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setClinicErr(null);
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
        {clinicErr ? <p className="text-sm text-destructive">{clinicErr}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="button" disabled={!isClinicFormComplete(form) || createClinicMut.isPending} onClick={() => createClinicMut.mutate()}>
            {t("admin.saveClinic", "Save clinic")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
