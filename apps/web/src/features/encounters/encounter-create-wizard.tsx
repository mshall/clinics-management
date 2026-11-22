import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, HeartPulse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appointmentStatusLabel } from "@/components/appointment-status-badge";
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
  useAppointmentsQuery,
  useClinicsQuery,
  usePatientQuery,
  usePatientsQuery,
  useSchedulingPhysiciansQuery,
} from "@/lib/api-hooks";
import type { AppointmentDto, EncounterDetailDto } from "@/lib/api-types";
import { canEditEncounterVisitFees } from "@/lib/appointment-encounter-money-policy";
import { collectEncounterCreateIssues } from "@/lib/create-form-validation";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiPost } from "@/lib/http";
import { formatClinicName, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { allergiesFormToApi, type PatientAllergyFormItem } from "@/lib/patient-allergies";
import { patientToPickListItem, resolvePatientListLabel } from "@/lib/patient-display";
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

type WizardStep = 1 | 2 | 3;

export type EncounterCreateWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, patient is locked (patient profile flow). */
  lockedPatientId?: string;
  lockedPatientLabel?: string;
  defaultClinicId?: string;
  profileComplete?: boolean;
};

export function EncounterCreateWizard({
  open,
  onOpenChange,
  lockedPatientId,
  lockedPatientLabel,
  defaultClinicId = "",
  profileComplete = true,
}: EncounterCreateWizardProps) {
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
  const patientLocked = Boolean(lockedPatientId);

  const [step, setStep] = useState<WizardStep>(1);
  const [createPatientId, setCreatePatientId] = useState("");
  const [createClinicId, setCreateClinicId] = useState("");
  const [createVisitType, setCreateVisitType] = useState<string>(DEFAULT_ENCOUNTER_VISIT_TYPE);
  const [createVisitFee, setCreateVisitFee] = useState("");
  const [createVisitCollection, setCreateVisitCollection] =
    useState<VisitCollectionValue>(emptyVisitCollection);
  const [createClinicianId, setCreateClinicianId] = useState("");
  const [pinnedPatientItem, setPinnedPatientItem] = useState<PickListItem | null>(null);
  const [pinnedClinicianItem, setPinnedClinicianItem] = useState<PickListItem | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [pinnedAppointmentItem, setPinnedAppointmentItem] = useState<PickListItem | null>(null);
  const [allergyItems, setAllergyItems] = useState<PatientAllergyFormItem[]>([]);
  const [acquisitionValues, setAcquisitionValues] = useState<PatientAcquisitionFormValues>(
    emptyPatientAcquisitionFormValues(),
  );
  const [createFieldErrors, setCreateFieldErrors] = useState<Set<string>>(() => new Set());

  const patientPickSearch = useDebouncedPickListSearch();
  const doctorPickSearch = useDebouncedPickListSearch();
  const aptPickSearch = useDebouncedPickListSearch();

  const effectivePatientId = patientLocked ? lockedPatientId! : createPatientId;
  const createVisitFeeCurrency = resolveClinicCurrency(createClinicId || clinics[0]?.id);

  const { data: registryPatData } = usePatientsQuery({ page: 1, pageSize: 1, enabled: open && !patientLocked });
  const patientRegistryTotal = patientLocked ? 1 : (registryPatData?.total ?? 0);

  const { data: dialogPatData, isPending: dialogPatientsPending } = usePatientsQuery({
    search: patientPickSearch.debounced.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: open && !patientLocked,
  });
  const dialogPatientItems: PickListItem[] = useMemo(
    () => (dialogPatData?.items ?? []).map((p) => patientToPickListItem(p)),
    [dialogPatData?.items],
  );

  const { data: selectedPatient } = usePatientQuery(open && effectivePatientId ? effectivePatientId : undefined);

  const aptPickerEnabled =
    open && (Boolean(effectivePatientId.trim()) || (!patientLocked && aptPickSearch.debounced.trim().length >= 2));
  const { data: aptPickerData, isPending: aptPickerPending } = useAppointmentsQuery({
    patientSearch:
      effectivePatientId.trim().length > 0
        ? undefined
        : aptPickSearch.debounced.trim().length >= 2
          ? aptPickSearch.debounced.trim()
          : undefined,
    patientId: effectivePatientId.trim() || undefined,
    bookableOnly: true,
    page: 1,
    pageSize: 50,
    enabled: aptPickerEnabled,
  });

  const { data: usersForDoctors, isFetching: doctorsFetching } = useSchedulingPhysiciansQuery({
    clinicId: createClinicId || undefined,
    search: doctorPickSearch.debounced.trim() || undefined,
    enabled: open && !isPhysician,
  });
  const doctorPickItems: PickListItem[] = useMemo(
    () => (usersForDoctors ?? []).map((d) => physicianToPickListItem(d, i18n.language)),
    [usersForDoctors, i18n.language],
  );

  const aptPickerRows = aptPickerData?.items ?? [];
  const aptPickerItems: PickListItem[] = useMemo(
    () =>
      aptPickerRows.map((a: AppointmentDto) => {
        const clinicHint = formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language);
        return {
          value: a.id,
          label: `${new Date(a.startsAt).toLocaleString(localeForLanguage(i18n.language))} · ${appointmentStatusLabel(a.status, t)}`,
          hint: [
            clinicHint,
            (() => {
              const p = resolvePatientListLabel({
                patientId: a.patientId,
                patientMrn: a.patientMrn,
                patientName: a.patientName,
              });
              return p.isIdFallback ? "—" : `${p.text}`;
            })(),
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    [aptPickerRows, i18n.language, t],
  );

  const patientPickBinding = usePickListValueBinding(
    createPatientId,
    (next) => {
      setCreatePatientId(next);
      setCreateFieldErrors((prev) => {
        if (!prev.has("patient")) return prev;
        const n = new Set(prev);
        n.delete("patient");
        return n;
      });
    },
    dialogPatientItems,
    pinnedPatientItem,
    setPinnedPatientItem,
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

  const resetForm = () => {
    setStep(1);
    patientPickSearch.resetSearch();
    setCreatePatientId(patientLocked ? lockedPatientId! : "");
    setPinnedPatientItem(null);
    setCreateClinicId(defaultClinicId || clinics[0]?.id || "");
    setCreateVisitType(DEFAULT_ENCOUNTER_VISIT_TYPE);
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    setCreateVisitFee(d != null && Number.isFinite(Number(d)) ? String(d) : "");
    setCreateVisitCollection(emptyVisitCollection);
    validation.clear();
    aptPickSearch.resetSearch();
    setSelectedAppointmentId("");
    setPinnedAppointmentItem(null);
    setCreateClinicianId(isPhysician && authUser?.id ? authUser.id : "");
    setPinnedClinicianItem(null);
    doctorPickSearch.resetSearch();
    setCreateFieldErrors(new Set());
    setAcquisitionValues(emptyPatientAcquisitionFormValues());
    setAllergyItems([]);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedPatientId, defaultClinicId]);

  useEffect(() => {
    if (!open) return;
    if (!effectivePatientId) {
      setAcquisitionValues(emptyPatientAcquisitionFormValues());
      return;
    }
    if (selectedPatient) {
      setAcquisitionValues(patientAcquisitionFormValuesFromPatient(selectedPatient));
    }
  }, [open, effectivePatientId, selectedPatient]);

  useEffect(() => {
    if (!open) return;
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    if (d != null && Number.isFinite(Number(d))) setCreateVisitFee(String(d));
  }, [open, adminOv.data?.currentTenant?.defaultVisitFee]);

  const createFieldInvalid = (key: string) => createFieldErrors.has(key);

  const clearCreateFieldError = (key: string) => {
    setCreateFieldErrors((prev) => {
      if (!prev.has(key)) return prev;
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  };

  const validateStep = (s: WizardStep): string[] => {
    if (s === 1) {
      const issues: string[] = [];
      if (!patientLocked && patientRegistryTotal === 0) {
        issues.push(t("encounters.noPatientsRegistered", "Register a patient before creating encounters."));
      }
      if (!effectivePatientId.trim()) issues.push(t("encounters.errorPatientRequired", "Select a patient."));
      if (!isPhysician && !createClinicianId.trim()) {
        issues.push(t("encounters.errorClinicianRequired", "Select the attending physician."));
      }
      if (!createClinicId.trim()) issues.push(t("encounters.errorClinicRequired", "Select a clinic."));
      return issues;
    }
    if (s === 2) {
      const issues: string[] = [];
      if (!createVisitType.trim()) {
        issues.push(t("encounters.errorVisitTypeRequired", "Select a visit type."));
      }
      const feeTrim = createVisitFee.trim();
      const feeNum = feeTrim === "" ? 0 : Number.parseFloat(feeTrim);
      if (canSetVisitFees && Number.isFinite(feeNum) && feeNum > 0) {
        const collectErr = validateVisitCollection(feeNum, createVisitCollection, t);
        if (collectErr) issues.push(collectErr);
      }
      return issues;
    }
    return collectEncounterCreateIssues(
      {
        patientRegistryTotal,
        patientId: effectivePatientId,
        clinicianId: createClinicianId,
        clinicId: createClinicId,
        visitType: createVisitType,
        isPhysician,
        acquisition: acquisitionValues,
      },
      t,
    );
  };

  const markStep1FieldErrors = () => {
    const errors = new Set<string>();
    if (!patientLocked && patientRegistryTotal === 0) {
      /* no field highlight */
    } else if (!effectivePatientId.trim()) errors.add("patient");
    if (!isPhysician && !createClinicianId.trim()) errors.add("clinician");
    if (!createClinicId.trim()) errors.add("clinic");
    setCreateFieldErrors(errors);
  };

  const goNext = () => {
    const issues = validateStep(step);
    if (issues.length) {
      if (step === 1) markStep1FieldErrors();
      if (step === 2 && !createVisitType.trim()) {
        setCreateFieldErrors((prev) => new Set(prev).add("visitType"));
      }
      validation.showIssues(issues);
      return;
    }
    setCreateFieldErrors(new Set());
    validation.clear();
    setStep((prev) => (prev < 3 ? ((prev + 1) as WizardStep) : prev));
  };

  const goBack = () => {
    validation.clear();
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  };

  const createMut = useMutation({
    mutationFn: () => {
      const patientAllergies = allergiesFormToApi(allergyItems);
      const body: Record<string, unknown> = {
        clinicId: createClinicId,
        patientId: effectivePatientId,
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
      if (selectedAppointmentId.trim()) body.appointmentId = selectedAppointmentId.trim();
      if (!isPhysician && createClinicianId.trim()) body.clinicianId = createClinicianId.trim();
      return apiPost<EncounterDetailDto>("/api/v1/encounters", body);
    },
    onSuccess: (enc) => {
      validation.clear();
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["patient", enc.patientId] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      navigate(`/encounters/${enc.id}`);
    },
    onError: (e: unknown) => validation.showError(e),
  });

  const handleSubmit = () => {
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

    const step1 = validateStep(1);
    const step2 = validateStep(2);
    const step3 = validateStep(3);
    const issues = [...step1, ...step2, ...step3];
    if (issues.length) {
      if (step1.length) {
        markStep1FieldErrors();
        setStep(1);
      } else if (step2.length) {
        if (!createVisitType.trim()) setCreateFieldErrors(new Set(["visitType"]));
        setStep(2);
      } else {
        setStep(3);
      }
      validation.showIssues(issues);
      return;
    }

    const feeTrim = createVisitFee.trim();
    const feeNum = feeTrim === "" ? 0 : Number.parseFloat(feeTrim);
    const collectErr =
      Number.isFinite(feeNum) && feeNum > 0 ? validateVisitCollection(feeNum, createVisitCollection, t) : null;
    if (collectErr) {
      toast.error(collectErr);
      setStep(2);
      return;
    }

    setCreateFieldErrors(new Set());
    validation.clear();
    createMut.mutate();
  };

  const steps = [
    {
      n: 1 as const,
      title: t("encounters.wizardStepPeople", "Patient & care team"),
      hint: t("encounters.wizardStepPeopleHint", "Patient, clinic, doctor, and optional booking"),
    },
    {
      n: 2 as const,
      title: t("encounters.wizardStepVisit", "Visit details"),
      hint: t("encounters.wizardStepVisitHint", "Visit type and fees"),
    },
    {
      n: 3 as const,
      title: t("encounters.wizardStepContext", "Context & confirm"),
      hint: t("encounters.wizardStepContextHint", "Allergies, acquisition, then open the visit"),
    },
  ];

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
          className="flex max-h-[min(92dvh,46rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          aria-describedby={undefined}
        >
          <DialogHeader className="space-y-3 border-b border-border bg-linear-to-br from-emerald-600/10 via-background to-background px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3 pe-8">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-kx-1">
                <HeartPulse className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg">
                  {t("encounters.createEncounterTitle", "Create encounter")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "encounters.wizardSubtitle",
                    "Start a clinical visit in a few guided steps. Required fields are marked.",
                  )}
                </DialogDescription>
              </div>
            </div>
            <ol
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              aria-label={t("encounters.wizardAria", "Encounter create steps")}
            >
              {steps.map((s) => {
                const active = step === s.n;
                const done = step > s.n;
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-start transition-colors",
                        active
                          ? "border-emerald-600/50 bg-emerald-600/5 ring-1 ring-emerald-600/25"
                          : done
                            ? "border-emerald-600/25 bg-emerald-600/5"
                            : "border-border bg-muted/20",
                      )}
                      aria-current={active ? "step" : undefined}
                      onClick={() => {
                        if (s.n < step) {
                          validation.clear();
                          setStep(s.n);
                        } else if (s.n === step + 1) {
                          goNext();
                        }
                      }}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                            done || active
                              ? "bg-emerald-600 text-white"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="size-3" aria-hidden /> : s.n}
                        </span>
                        {t("encounters.wizardStepLabel", "Step {{n}}", { n: s.n })}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{s.title}</span>
                      <span className="hidden text-xs text-muted-foreground md:block">{s.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-visible px-4 py-4 sm:px-6">
            {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}

            {step === 1 ? (
              <div className="grid gap-4">
                {!patientLocked && patientRegistryTotal === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("encounters.noPatientsRegistered", "Register a patient first.")}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <Label required>{t("encounters.patient")}</Label>
                  {patientLocked ? (
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                      <p className="font-medium text-foreground">{lockedPatientLabel ?? lockedPatientId}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {t("encounters.selectPatientHint", "Choose a patient from the list (search by name or MRN).")}
                      </p>
                      <SearchablePickList
                        items={dialogPatientItems}
                        value={createPatientId}
                        selectedItem={patientPickBinding.selectedItem}
                        invalid={createFieldInvalid("patient")}
                        onValueChange={patientPickBinding.onValueChange}
                        onSearchQueryChange={patientPickSearch.setSearch}
                        onOpen={patientPickSearch.handleOpen}
                        searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                        placeholder={t("encounters.pickPatient", "Pick patient")}
                        emptyMessage={
                          dialogPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                        }
                        localFilter={false}
                        minSearchLength={1}
                        idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <Label>{t("encounters.linkedAppointment", "Booked appointment (optional)")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "encounters.linkedAppointmentHint",
                      "Search by patient name, MRN, phone, or national ID. Linking sets the appointment to checked in until the encounter is finalized (then completed).",
                    )}
                  </p>
                  <SearchablePickList
                    items={aptPickerItems}
                    value={selectedAppointmentId}
                    selectedItem={pinnedAppointmentItem}
                    onValueChange={(v, item) => {
                      setSelectedAppointmentId(v);
                      const row = aptPickerRows.find((a) => a.id === v);
                      const picked = item ?? aptPickerItems.find((i) => i.value === v) ?? null;
                      setPinnedAppointmentItem(picked);
                      if (row) {
                        if (!patientLocked) {
                          setCreatePatientId(row.patientId);
                          const patientItem = dialogPatientItems.find((p) => p.value === row.patientId);
                          if (patientItem) setPinnedPatientItem(patientItem);
                        }
                        setCreateClinicId(row.clinicId);
                        setCreateClinicianId(row.clinicianId);
                        if (row.feeAmount != null && Number.isFinite(row.feeAmount)) {
                          setCreateVisitFee(String(row.feeAmount));
                        }
                      }
                    }}
                    onSearchQueryChange={aptPickSearch.setSearch}
                    onOpen={aptPickSearch.handleOpen}
                    searchPlaceholder={t(
                      "encounters.appointmentSearchPlaceholder",
                      "Type at least 2 characters or pick a patient first…",
                    )}
                    placeholder={t("encounters.linkedAppointment", "Booked appointment (optional)")}
                    emptyMessage={
                      aptPickerPending
                        ? t("common.loading")
                        : t("encounters.noBookableAppointments", "No matching open appointments.")
                    }
                    localFilter={false}
                    minSearchLength={effectivePatientId.trim().length > 0 ? 0 : 2}
                    idleMessage={t(
                      "encounters.appointmentSearchIdle",
                      "Type to search or select a patient to see their bookings.",
                    )}
                  />
                  {selectedAppointmentId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSelectedAppointmentId("");
                        setPinnedAppointmentItem(null);
                        if (!isPhysician) {
                          setCreateClinicianId("");
                          setPinnedClinicianItem(null);
                        }
                      }}
                    >
                      {t("encounters.clearAppointment", "Clear appointment link")}
                    </Button>
                  ) : null}
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
                      clearCreateFieldError("clinic");
                    }}
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClinicName(c, i18n.language)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
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
                      clearCreateFieldError("visitType");
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
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <PatientAllergiesField value={allergyItems} onChange={setAllergyItems} />
                <PatientAcquisitionFields values={acquisitionValues} onChange={setAcquisitionValues} />
              </div>
            ) : null}
          </div>

          <DialogFooter
            className={cn(
              "static m-0 shrink-0 w-full flex-col gap-3 border-t border-border bg-muted/10 p-4",
              "sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-6",
              "[&>button]:min-h-11 sm:[&>button]:min-h-10",
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={goBack}
                  disabled={createMut.isPending}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  {t("encounters.wizardBack", "Back")}
                </Button>
              ) : null}
              {step < 3 ? (
                <Button type="button" className="w-full sm:w-auto" onClick={goNext}>
                  {t("encounters.wizardNext", "Continue")}
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              ) : (
                <CreateActionButton
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={createMut.isPending}
                  onClick={handleSubmit}
                >
                  {t("encounters.createAndOpen", "Create & open")}
                </CreateActionButton>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}
