import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PatientAcquisitionFields,
  type PatientAcquisitionFormValues,
} from "@/components/patient-acquisition-fields";
import { PatientPhoneField } from "@/components/patient-phone-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PatientDto } from "@/lib/api-schema";
import { useClinicsQuery } from "@/lib/api-hooks";
import {
  canSavePatientDemographicsForm,
  demographicsFormToPatchBody,
  patientToDemographicsForm,
  validatePatientDemographicsForm,
  type PatientDemographicsFormValues,
} from "@/lib/patient-form-utils";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { apiPatch } from "@/lib/http";
import {
  parsePhoneConflictFromError,
  phoneConflictMessage,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";
import { formatClinicName } from "@/lib/locale-display";

type PatientEditDialogProps = {
  patient: PatientDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PatientEditDialog({ patient, open, onOpenChange }: PatientEditDialogProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const [formErr, setFormErr] = useState<string | null>(null);
  const [phoneConflict, setPhoneConflict] = useState<PatientPhoneConflictPatient | null>(null);
  const [values, setValues] = useState<PatientDemographicsFormValues>(() => patientToDemographicsForm(patient));

  useEffect(() => {
    if (!open) return;
    setValues(patientToDemographicsForm(patient));
    setFormErr(null);
    setPhoneConflict(null);
  }, [open, patient]);

  const patchMut = useMutation({
    mutationFn: () => {
      const err = validatePatientDemographicsForm(values, t);
      if (err) throw new Error(err);
      if (phoneConflict) {
        throw new Error(phoneConflictMessage(phoneConflict, t, i18n.language));
      }
      return apiPatch<PatientDto>(`/api/v1/patients/${patient.id}`, demographicsFormToPatchBody(values));
    },
    onSuccess: () => {
      setFormErr(null);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["patient", patient.id] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      const conflict = parsePhoneConflictFromError(e);
      if (conflict) {
        setPhoneConflict(conflict);
        setFormErr(phoneConflictMessage(conflict, t, i18n.language));
        return;
      }
      setFormErr(apiErrorMessage(e));
    },
  });

  const setAcquisition = (acquisition: PatientAcquisitionFormValues) => {
    setValues((prev) => ({ ...prev, acquisition }));
  };

  const canSave = canSavePatientDemographicsForm(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("patients.editPatientTitle", "Edit patient")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}
          <div className="space-y-2">
            <Label required>{t("patients.firstNameEn")}</Label>
            <Input
              value={values.firstNameEn}
              onChange={(e) => setValues((prev) => ({ ...prev, firstNameEn: e.target.value }))}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label required>{t("patients.lastNameEn")}</Label>
            <Input
              value={values.lastNameEn}
              onChange={(e) => setValues((prev) => ({ ...prev, lastNameEn: e.target.value }))}
              autoComplete="family-name"
            />
          </div>
          <div className="space-y-2">
            <Label required>{t("patients.firstNameAr")}</Label>
            <Input
              value={values.firstNameAr}
              onChange={(e) => setValues((prev) => ({ ...prev, firstNameAr: e.target.value }))}
              dir="rtl"
            />
          </div>
          <div className="space-y-2">
            <Label required>{t("patients.lastNameAr")}</Label>
            <Input
              value={values.lastNameAr}
              onChange={(e) => setValues((prev) => ({ ...prev, lastNameAr: e.target.value }))}
              dir="rtl"
            />
          </div>
          <div className="space-y-2">
            <Label optional>{t("patients.dob")}</Label>
            <Input
              className="ltr-nums"
              type="date"
              value={values.dob}
              onChange={(e) => setValues((prev) => ({ ...prev, dob: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.gender")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.gender}
              onChange={(e) => setValues((prev) => ({ ...prev, gender: e.target.value }))}
            >
              <option value="M">{t("patients.genderM")}</option>
              <option value="F">{t("patients.genderF")}</option>
            </select>
          </div>
          <PatientPhoneField
            value={values.phone}
            onChange={(phone) => setValues((prev) => ({ ...prev, phone }))}
            excludePatientId={patient.id}
            enabled={open}
            externalConflict={phoneConflict}
            onConflictChange={setPhoneConflict}
          />
          <div className="space-y-2">
            <Label optional>{t("patients.nationalId")}</Label>
            <Input
              className="ltr-nums"
              value={values.nationalId}
              onChange={(e) => setValues((prev) => ({ ...prev, nationalId: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label optional>{t("patients.email")}</Label>
            <Input
              type="text"
              inputMode="email"
              value={values.email}
              onChange={(e) => setValues((prev) => ({ ...prev, email: e.target.value }))}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.homeBranch")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.homeBranchId}
              onChange={(e) => setValues((prev) => ({ ...prev, homeBranchId: e.target.value }))}
            >
              <option value="">{t("patients.noHomeBranch", "None")}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatClinicName(c, i18n.language)}
                </option>
              ))}
            </select>
          </div>
          <PatientAcquisitionFields values={values.acquisition} onChange={setAcquisition} />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" disabled={!canSave || Boolean(phoneConflict) || patchMut.isPending} onClick={() => patchMut.mutate()}>
              {t("common.save", "Save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
