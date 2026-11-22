import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import {
  emptyPatientAcquisitionFormValues,
  PatientAcquisitionFields,
  patientAcquisitionFormToBody,
  patientAcquisitionFormValuesFromPatient,
  type PatientAcquisitionFormValues,
} from "@/components/patient-acquisition-fields";
import { PatientAllergiesField } from "@/components/patient-allergies-field";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { VisitCollectionFields } from "@/components/visit-collection-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import {
  useAdminOverviewQuery,
  useClinicsQuery,
  usePatientQuery,
  useSchedulingPhysiciansQuery,
} from "@/lib/api-hooks";
import type { EncounterDetailDto } from "@/lib/api-types";
import { canEditEncounterVisitFees } from "@/lib/appointment-encounter-money-policy";
import { collectEncounterCreateIssues } from "@/lib/create-form-validation";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiPost } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import { allergiesFormToApi, type PatientAllergyFormItem } from "@/lib/patient-allergies";
import { physicianToPickListItem } from "@/lib/physician-display";
import { useDebouncedPickListSearch, usePickListValueBinding } from "@/lib/pick-list-utils";
import { useClinicCurrencyResolver } from "@/lib/use-clinic-currency-resolver";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ENCOUNTER_VISIT_TYPE,
  ENCOUNTER_VISIT_TYPES,
  formatVisitType,
} from "@/lib/visit-types";
import {
  emptyVisitCollection,
  validateVisitCollection,
  visitCollectionToApi,
  type VisitCollectionValue,
} from "@/lib/visit-collection";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

export type PatientEncounterCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientLabel: string;
  defaultClinicId?: string;
  profileComplete?: boolean;
};

export function PatientEncounterCreateDialog({
  open,
  onOpenChange,
  patientId,
  patientLabel,
  defaultClinicId = "",
  profileComplete = true,
}: PatientEncounterCreateDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
  const canSetVisitFees = canEditEncounterVisitFees(authUser?.role, authUser?.moneyVisibilityOverrides);
  const resolveClinicCurrency = useClinicCurrencyResolver();
  const { data: clinics = [] } = useClinicsQuery();
  const adminOv = useAdminOverviewQuery();
  const validation = useValidationIssuesDialog({ intent: "create" });

  const [createClinicId, setCreateClinicId] = useState("");
  const [createVisitType, setCreateVisitType] = useState<string>(DEFAULT_ENCOUNTER_VISIT_TYPE);
  const [createVisitFee, setCreateVisitFee] = useState("");
  const [createVisitCollection, setCreateVisitCollection] =
    useState<VisitCollectionValue>(emptyVisitCollection);
  const [createClinicianId, setCreateClinicianId] = useState("");
  const [pinnedClinicianItem, setPinnedClinicianItem] = useState<PickListItem | null>(null);
  const [allergyItems, setAllergyItems] = useState<PatientAllergyFormItem[]>([]);
  const [acquisitionValues, setAcquisitionValues] = useState<PatientAcquisitionFormValues>(
    emptyPatientAcquisitionFormValues(),
  );
  const [createFieldErrors, setCreateFieldErrors] = useState<Set<string>>(() => new Set());
  const doctorPickSearch = useDebouncedPickListSearch();

  const createVisitFeeCurrency = resolveClinicCurrency(createClinicId || clinics[0]?.id);
  const { data: selectedPatient } = usePatientQuery(open ? patientId : undefined);

  const { data: usersForDoctors, isFetching: doctorsFetching } = useSchedulingPhysiciansQuery({
    clinicId: createClinicId || undefined,
    search: doctorPickSearch.debounced.trim() || undefined,
    enabled: open && !isPhysician,
  });
  const doctorPickItems: PickListItem[] = useMemo(
    () => (usersForDoctors ?? []).map((d) => physicianToPickListItem(d, i18n.language)),
    [usersForDoctors, i18n.language],
  );

  const clinicianPickBinding = usePickListValueBinding(
    createClinicianId,
    (next) => {
      setCreateClinicianId(next);
      setCreateFieldErrors((prev) => {
        if (!prev.has("clinician")) return prev;
        const n = new Set(prev);
        n.delete("clinician");
        return n;
      });
    },
    doctorPickItems,
    pinnedClinicianItem,
    setPinnedClinicianItem,
  );

  useEffect(() => {
    if (!open) return;
    setCreateClinicId(defaultClinicId || clinics[0]?.id || "");
    setCreateVisitType(DEFAULT_ENCOUNTER_VISIT_TYPE);
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    setCreateVisitFee(d != null && Number.isFinite(Number(d)) ? String(d) : "");
    setCreateVisitCollection(emptyVisitCollection);
    setCreateClinicianId(isPhysician && authUser?.id ? authUser.id : "");
    setPinnedClinicianItem(null);
    doctorPickSearch.resetSearch();
    setAllergyItems([]);
    setCreateFieldErrors(new Set());
    validation.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, defaultClinicId]);

  useEffect(() => {
    if (!open) return;
    if (selectedPatient) {
      setAcquisitionValues(patientAcquisitionFormValuesFromPatient(selectedPatient));
    } else {
      setAcquisitionValues(emptyPatientAcquisitionFormValues());
    }
  }, [open, selectedPatient]);

  useEffect(() => {
    if (!open) return;
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    if (d != null && Number.isFinite(Number(d))) setCreateVisitFee(String(d));
  }, [open, adminOv.data?.currentTenant?.defaultVisitFee]);

  const createFieldInvalid = (key: string) => createFieldErrors.has(key);

  const createMut = useMutation({
    mutationFn: () => {
      const patientAllergies = allergiesFormToApi(allergyItems);
      const body: Record<string, unknown> = {
        clinicId: createClinicId,
        patientId,
        visitType: createVisitType,
        chiefComplaint: "",
        ...patientAcquisitionFormToBody(acquisitionValues),
        ...(patientAllergies.length ? { patientAllergies } : {}),
      };
      if (canSetVisitFees) {
        const trimmed = createVisitFee.trim();
        let feeAmount = 0;
        if (trimmed !== "") {
          const fee = Number.parseFloat(trimmed);
          if (Number.isFinite(fee) && fee >= 0) {
            body.visitFeeAmount = fee;
            feeAmount = fee;
          }
        }
        const visitCollection = visitCollectionToApi(feeAmount, createVisitCollection);
        if (visitCollection) body.visitCollection = visitCollection;
      }
      if (!isPhysician && createClinicianId.trim()) body.clinicianId = createClinicianId.trim();
      return apiPost<EncounterDetailDto>("/api/v1/encounters", body);
    },
    onSuccess: (enc) => {
      validation.clear();
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      navigate(`/encounters/${enc.id}`);
    },
    onError: (e: unknown) => validation.showError(e),
  });

  const handleCreate = () => {
    if (createMut.isPending) return;
    if (profileComplete === false) {
      validation.showIssues([
        t(
          "patients.errorProfileIncompleteForEncounter",
          "Complete this patient profile before starting an encounter.",
        ),
      ]);
      return;
    }

    const feeTrim = createVisitFee.trim();
    const feeNum = feeTrim === "" ? 0 : Number.parseFloat(feeTrim);
    const collectErr =
      Number.isFinite(feeNum) && feeNum > 0 ? validateVisitCollection(feeNum, createVisitCollection, t) : null;
    if (collectErr) {
      toast.error(collectErr);
      return;
    }

    const issues = collectEncounterCreateIssues(
      {
        patientRegistryTotal: 1,
        patientId,
        clinicianId: createClinicianId,
        clinicId: createClinicId,
        visitType: createVisitType,
        isPhysician,
        acquisition: acquisitionValues,
      },
      t,
    );
    if (issues.length > 0) {
      const errors = new Set<string>();
      if (!createClinicId.trim()) errors.add("clinic");
      if (!isPhysician && !createClinicianId.trim()) errors.add("clinician");
      if (!createVisitType.trim()) errors.add("visitType");
      setCreateFieldErrors(errors);
      validation.showIssues(issues);
      return;
    }

    setCreateFieldErrors(new Set());
    validation.clear();
    createMut.mutate();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && createMut.isPending) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,42rem)] max-w-lg overflow-y-auto overflow-x-visible"
          aria-describedby={undefined}
        >
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/90 text-white shadow-kx-1">
                <HeartPulse className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <DialogTitle>{t("encounters.createEncounterTitle", "Create encounter")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "patients.newEncounterDialogHint",
                    "Start a clinical visit for this patient. Choose the attending doctor and visit type.",
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-3 pt-1">
            {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("encounters.patient")}
              </p>
              <p className="mt-0.5 font-medium text-foreground">{patientLabel}</p>
            </div>

            {!isPhysician ? (
              <div className="space-y-2">
                <Label required>{t("encounters.attendingPhysician")}</Label>
                <p className="text-xs text-muted-foreground">{t("encounters.attendingPhysicianHint")}</p>
                <SearchablePickList
                  items={doctorPickItems}
                  value={createClinicianId}
                  selectedItem={clinicianPickBinding.selectedItem}
                  invalid={createFieldInvalid("clinician")}
                  onValueChange={clinicianPickBinding.onValueChange}
                  onSearchQueryChange={doctorPickSearch.setSearch}
                  onOpen={doctorPickSearch.handleOpen}
                  searchPlaceholder={t(
                    "appointments.filterPhysician",
                    "Type physician name, Arabic name, or email…",
                  )}
                  placeholder={t("encounters.attendingPhysician")}
                  emptyMessage={
                    doctorsFetching && doctorPickItems.length === 0
                      ? t("common.loading")
                      : t("encounters.noDoctors", "No doctor accounts in this organization.")
                  }
                  localFilter={false}
                  minSearchLength={0}
                  idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label required>{t("encounters.clinic", "Clinic")}</Label>
              <select
                className={cn(
                  nativeSelectClassName,
                  createFieldInvalid("clinic") && "border-destructive ring-1 ring-destructive",
                )}
                value={createClinicId}
                onChange={(e) => {
                  setCreateClinicId(e.target.value);
                  setCreateFieldErrors((prev) => {
                    if (!prev.has("clinic")) return prev;
                    const n = new Set(prev);
                    n.delete("clinic");
                    return n;
                  });
                }}
              >
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClinicName(c, i18n.language)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label required>{t("encounters.visitType")}</Label>
              <select
                className={cn(
                  nativeSelectClassName,
                  createFieldInvalid("visitType") && "border-destructive ring-1 ring-destructive",
                )}
                value={createVisitType}
                onChange={(e) => {
                  setCreateVisitType(e.target.value);
                  setCreateFieldErrors((prev) => {
                    if (!prev.has("visitType")) return prev;
                    const n = new Set(prev);
                    n.delete("visitType");
                    return n;
                  });
                }}
              >
                {ENCOUNTER_VISIT_TYPES.map((vt) => (
                  <option key={vt} value={vt}>
                    {formatVisitType(vt, t)}
                  </option>
                ))}
              </select>
            </div>

            {canSetVisitFees ? (
              <div className="space-y-2">
                <Label>
                  {t("encounters.visitFee", "Visit fee ({{currency}})", {
                    currency: createVisitFeeCurrency,
                  })}
                </Label>
                <Input
                  className="ltr-nums"
                  type="number"
                  min="0"
                  step="0.01"
                  value={createVisitFee}
                  onChange={(e) => setCreateVisitFee(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "encounters.visitFeeHint",
                    "Default comes from clinic settings ({{currency}}).",
                    { currency: createVisitFeeCurrency },
                  )}
                </p>
                <VisitCollectionFields
                  amount={(() => {
                    const n = Number.parseFloat(createVisitFee.trim());
                    return Number.isFinite(n) && n > 0 ? n : 0;
                  })()}
                  value={createVisitCollection}
                  onChange={setCreateVisitCollection}
                  disabled={createMut.isPending}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "encounters.visitFeeHiddenRole",
                  "Visit fees use organization defaults for your role. An administrator can enable fee fields per user.",
                )}
              </p>
            )}

            <PatientAllergiesField
              className="border-t border-border pt-3"
              value={allergyItems}
              onChange={setAllergyItems}
            />
            <PatientAcquisitionFields
              className="space-y-0 border-t border-border pt-3"
              values={acquisitionValues}
              onChange={setAcquisitionValues}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <CreateActionButton type="button" disabled={createMut.isPending} onClick={handleCreate}>
                {t("encounters.createAndOpen", "Create & open")}
              </CreateActionButton>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}
