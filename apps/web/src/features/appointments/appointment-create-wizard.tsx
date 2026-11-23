import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import {
  CreateWizardBody,
  CreateWizardDialogContent,
  CreateWizardFooter,
  CreateWizardHeader,
} from "@/components/create-wizard-chrome";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { PatientPhoneField } from "@/components/patient-phone-field";
import { ScheduledFeeCollectionFields } from "@/components/scheduled-fee-collection-fields";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { AppointmentOverlapConfirmDialog } from "@/features/appointments/appointment-overlap-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
import type { AppointmentDto } from "@/lib/api-types";
import {
  APPOINTMENT_SLOT_MINUTES,
  defaultEndFromStart,
  formatDatetimeLocal,
  suggestNextAppointmentStart,
} from "@/lib/appointment-scheduling";
import { canEditAppointmentFees } from "@/lib/appointment-encounter-money-policy";
import {
  formatClinicHoursRange,
  formatClinicTimeLabel,
  isStartAfterClosing,
  resolveClinicClosingTime,
  resolveClinicOpeningTime,
} from "@/lib/clinic-hours";
import { collectAppointmentCreateIssues } from "@/lib/create-form-validation";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPost } from "@/lib/http";
import { VisitModeSelector, type VisitMode } from "@/features/telehealth/visit-mode-selector";
import { formatClinicName, localeForLanguage } from "@/lib/locale-display";
import {
  parsePhoneConflictFromError,
  phoneConflictMessage,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";
import { patientToPickListItem } from "@/lib/patient-display";
import { physicianToPickListItem } from "@/lib/physician-display";
import { useDebouncedPickListSearch } from "@/lib/pick-list-utils";
import { useSchedulingSlotsQuery } from "@/lib/scheduling-slots";
import { useClinicCurrencyResolver } from "@/lib/use-clinic-currency-resolver";
import {
  DEFAULT_ENCOUNTER_VISIT_TYPE,
  ENCOUNTER_VISIT_TYPES,
  formatVisitType,
} from "@/lib/visit-types";
import {
  emptyScheduledFeeCollection,
  scheduledFeeCollectionToApi,
  validateScheduledFeeCollection,
  type ScheduledFeeCollectionValue,
} from "@/lib/visit-collection";
import { useAuthStore } from "@/stores/auth-store";

type WizardStep = 1 | 2 | 3;

function toAppointmentIso(localDatetime: string): string {
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d.toISOString();
}

export type AppointmentCreateWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, patient is locked to this chart (patient profile flow). */
  lockedPatientId?: string;
  lockedPatientLabel?: string;
  /** Navigate to the new appointment after success (default true). */
  navigateOnSuccess?: boolean;
};

export function AppointmentCreateWizard({
  open,
  onOpenChange,
  lockedPatientId,
  lockedPatientLabel,
  navigateOnSuccess = true,
}: AppointmentCreateWizardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
  const isCallCenter = authUser?.role === "call_center";
  const canSetAppointmentFees = canEditAppointmentFees(authUser?.role, authUser?.moneyVisibilityOverrides);
  const resolveClinicCurrency = useClinicCurrencyResolver();
  const { data: clinics = [] } = useClinicsQuery();
  const adminOv = useAdminOverviewQuery();
  const validation = useValidationIssuesDialog({ intent: "create" });

  const [step, setStep] = useState<WizardStep>(1);
  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [bookPatientMode, setBookPatientMode] = useState<"existing" | "new">("existing");
  const [provisionalFirstName, setProvisionalFirstName] = useState("");
  const [provisionalLastName, setProvisionalLastName] = useState("");
  const [provisionalPhone, setProvisionalPhone] = useState("");
  const [provisionalPhoneConflict, setProvisionalPhoneConflict] =
    useState<PatientPhoneConflictPatient | null>(null);
  const [clinicianId, setClinicianId] = useState("");
  const [pinnedPhysicianItem, setPinnedPhysicianItem] = useState<PickListItem | null>(null);
  const [selectedBookPatientItem, setSelectedBookPatientItem] = useState<PickListItem | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [visitType, setVisitType] = useState<string>(DEFAULT_ENCOUNTER_VISIT_TYPE);
  const [visitMode, setVisitMode] = useState<VisitMode>("IN_CLINIC");
  const [bookFee, setBookFee] = useState("");
  const [bookFeeCollection, setBookFeeCollection] =
    useState<ScheduledFeeCollectionValue>(emptyScheduledFeeCollection());
  const [overlapConflicts, setOverlapConflicts] = useState<AppointmentDto[]>([]);
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);

  const bookPatientPickSearch = useDebouncedPickListSearch();
  const bookDoctorPickSearch = useDebouncedPickListSearch();
  const bookFeeCurrency = resolveClinicCurrency(clinicId);
  const selectedBookClinic = useMemo(() => clinics.find((c) => c.id === clinicId), [clinics, clinicId]);
  const clinicOpeningTime = resolveClinicOpeningTime(selectedBookClinic?.openingTime);
  const clinicClosingTime = resolveClinicClosingTime(selectedBookClinic?.closingTime);
  const bookHoursLocale = localeForLanguage(i18n.language);
  const bookingAfterClosing = Boolean(
    isCallCenter && clinicId.trim() && start.trim() && isStartAfterClosing(start, clinicClosingTime),
  );

  const patientLocked = Boolean(lockedPatientId?.trim());

  const resetForm = () => {
    setStep(1);
    setClinicId("");
    setPatientId(lockedPatientId?.trim() ?? "");
    setSelectedBookPatientItem(
      lockedPatientId && lockedPatientLabel
        ? { value: lockedPatientId, label: lockedPatientLabel }
        : null,
    );
    setBookPatientMode("existing");
    setProvisionalFirstName("");
    setProvisionalLastName("");
    setProvisionalPhone("");
    setProvisionalPhoneConflict(null);
    setClinicianId(authUser?.role === "physician" && authUser.id ? authUser.id : "");
    setPinnedPhysicianItem(null);
    bookPatientPickSearch.resetSearch();
    bookDoctorPickSearch.resetSearch();
    setStart("");
    setEnd("");
    setVisitType(DEFAULT_ENCOUNTER_VISIT_TYPE);
    setVisitMode("IN_CLINIC");
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    setBookFee(d != null && Number.isFinite(Number(d)) ? String(d) : "");
    setBookFeeCollection(emptyScheduledFeeCollection());
    setOverlapConflicts([]);
    setShowOverlapConfirm(false);
    validation.clear();
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedPatientId]);

  useEffect(() => {
    if (authUser?.role === "physician" && authUser.id) setClinicianId(authUser.id);
  }, [authUser?.role, authUser?.id, open]);

  useEffect(() => {
    if (!open) return;
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    if (d != null && Number.isFinite(Number(d))) setBookFee(String(d));
  }, [open, adminOv.data?.currentTenant?.defaultVisitFee]);

  const { data: bookPatData, isPending: bookPatientsPending } = usePatientsQuery({
    search: bookPatientPickSearch.debounced.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: open && !patientLocked && bookPatientMode === "existing",
  });
  const bookPatients = bookPatData?.items ?? [];
  const selectedBookPatient = useMemo(
    () => bookPatients.find((p) => p.id === patientId),
    [bookPatients, patientId],
  );
  const schedulingClinicId = clinicId || selectedBookPatient?.homeBranchId || "";

  const { data: physicians = [], isFetching: physiciansFetching } = useSchedulingPhysiciansQuery({
    clinicId: schedulingClinicId || undefined,
    search: bookDoctorPickSearch.debounced.trim() || undefined,
    enabled: open && !isPhysician,
  });

  const bookPatientItems: PickListItem[] = useMemo(
    () => bookPatients.map((p) => patientToPickListItem(p)),
    [bookPatients],
  );
  const selectedBookPatientMissing = Boolean(
    patientId && !bookPatientItems.some((p) => p.value === patientId),
  );
  const { data: selectedBookPatientDetail } = usePatientQuery(
    open && (patientLocked || selectedBookPatientMissing) ? patientId || lockedPatientId : undefined,
  );
  const bookPatientSelectedItem = useMemo((): PickListItem | null => {
    if (!patientId) return null;
    const fromList = bookPatientItems.find((p) => p.value === patientId);
    if (fromList) return fromList;
    if (selectedBookPatientItem?.value === patientId) return selectedBookPatientItem;
    if (selectedBookPatientDetail) return patientToPickListItem(selectedBookPatientDetail);
    if (lockedPatientId === patientId && lockedPatientLabel) {
      return { value: lockedPatientId, label: lockedPatientLabel };
    }
    return null;
  }, [
    patientId,
    bookPatientItems,
    selectedBookPatientItem,
    selectedBookPatientDetail,
    lockedPatientId,
    lockedPatientLabel,
  ]);

  const clinicItems: PickListItem[] = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );
  const physicianItems: PickListItem[] = useMemo(
    () => physicians.map((d) => physicianToPickListItem(d, i18n.language)),
    [physicians, i18n.language],
  );
  const selectedPhysician = useMemo(
    () => physicians.find((d) => d.userId === clinicianId),
    [physicians, clinicianId],
  );
  const bookPhysicianSelectedItem = useMemo((): PickListItem | null => {
    if (!clinicianId) return null;
    if (pinnedPhysicianItem?.value === clinicianId) return pinnedPhysicianItem;
    const fromList = physicianItems.find((d) => d.value === clinicianId);
    if (fromList) return fromList;
    if (selectedPhysician) return physicianToPickListItem(selectedPhysician, i18n.language);
    return null;
  }, [clinicianId, pinnedPhysicianItem, physicianItems, selectedPhysician, i18n.language]);

  const bookDateIso = start.trim() ? start.split("T")[0]! : new Date().toISOString().slice(0, 10);
  const { data: bookTypes } = useQuery({
    queryKey: ["scheduling", "appointment-types", schedulingClinicId],
    queryFn: () =>
      apiGet<Array<{ id: string; isActive: boolean; durationMinutes: number; serviceLocation?: string }>>(
        `/api/v1/scheduling/appointment-types?clinicId=${encodeURIComponent(schedulingClinicId)}`,
      ),
    enabled: open && Boolean(schedulingClinicId.trim()),
  });
  // ADR-039: telehealth bookings use a VIDEO service (own duration and price); in-person ones never pick a VIDEO/HOME service by accident.
  const videoType = bookTypes?.find((x) => x.isActive && x.serviceLocation === "VIDEO");
  const bookTypeId =
    (visitMode === "TELEHEALTH" ? videoType?.id : bookTypes?.find((x) => x.isActive && x.serviceLocation !== "VIDEO" && x.serviceLocation !== "HOME")?.id) ?? bookTypes?.find((x) => x.isActive)?.id ?? "";
  const slotWindowFrom = `${bookDateIso}T00:00:00.000Z`;
  const slotWindowTo = new Date(new Date(slotWindowFrom).getTime() + 86_400_000).toISOString();
  const { data: engineSlots } = useSchedulingSlotsQuery({
    clinicId: schedulingClinicId,
    clinicianId,
    typeId: bookTypeId,
    from: slotWindowFrom,
    to: slotWindowTo,
    enabled: open && Boolean(schedulingClinicId && clinicianId && bookTypeId),
  });
  const { data: bookDayData } = useAppointmentsQuery({
    page: 1,
    pageSize: 200,
    sortBy: "startsAt",
    sortOrder: "asc",
    from: bookDateIso,
    to: bookDateIso,
    enabled: open && Boolean(clinicianId.trim()),
  });

  useEffect(() => {
    if (!open || !clinicianId.trim()) return;
    const engineFirst = engineSlots?.slots[0]?.startsAt;
    const suggested =
      engineFirst != null
        ? formatDatetimeLocal(new Date(engineFirst))
        : suggestNextAppointmentStart(
            bookDayData?.items ?? [],
            bookDateIso,
            clinicianId,
            clinicOpeningTime,
          );
    setStart((prev) => {
      if (!prev.trim()) return suggested;
      const prevDate = prev.split("T")[0];
      if (prevDate !== bookDateIso) return suggested;
      return prev;
    });
  }, [open, clinicianId, bookDateIso, bookDayData?.items, clinicOpeningTime, engineSlots?.slots]);

  useEffect(() => {
    if (open && !start.trim()) {
      const today = new Date().toISOString().slice(0, 10);
      setStart(formatDatetimeLocal(new Date(`${today}T${clinicOpeningTime}`)));
    }
  }, [open, start, clinicOpeningTime]);

  useEffect(() => {
    if (!open) return;
    if (!start.trim()) {
      setEnd("");
      return;
    }
    setEnd(defaultEndFromStart(start));
  }, [open, start]);

  useEffect(() => {
    if (!open || clinicId.trim() || !clinics.length) return;
    const home = selectedBookPatientDetail?.homeBranchId ?? selectedBookPatient?.homeBranchId;
    setClinicId(home && clinics.some((c) => c.id === home) ? home : clinics[0]!.id);
  }, [open, clinicId, clinics, selectedBookPatientDetail?.homeBranchId, selectedBookPatient?.homeBranchId]);

  const appointmentCreateInput = {
    clinicId,
    patientId,
    clinicianId,
    start,
    end,
    openingTime: clinicOpeningTime,
    newPatientMode: !patientLocked && bookPatientMode === "new",
    provisionalFirstName,
    provisionalLastName,
    provisionalPhone,
  };

  const buildCreateBody = (confirmOverlap = false): Record<string, unknown> => {
    const startsAt = toAppointmentIso(start);
    const body: Record<string, unknown> = {
      clinicId,
      clinicianId,
      startsAt,
      notes: visitType,
      ...(visitMode === "TELEHEALTH" ? { visitMode: "TELEHEALTH", ...(videoType ? { appointmentTypeId: videoType.id } : {}) } : {}),
    };
    if (!patientLocked && bookPatientMode === "new") {
      body.provisionalPatient = {
        firstNameEn: provisionalFirstName.trim(),
        lastNameEn: provisionalLastName.trim(),
        phone: provisionalPhone.trim(),
      };
    } else {
      body.patientId = patientId || lockedPatientId;
    }
    if (end.trim()) body.endsAt = toAppointmentIso(end);
    if (confirmOverlap) body.confirmOverlap = true;
    if (canSetAppointmentFees) {
      const trimmedFee = bookFee.trim();
      const fee = trimmedFee !== "" ? Number.parseFloat(trimmedFee) : NaN;
      if (Number.isFinite(fee) && fee >= 0) {
        body.feeAmount = fee;
        const scheduled = scheduledFeeCollectionToApi(fee, bookFeeCollection);
        if (scheduled) body.scheduledFeeCollection = scheduled;
      }
    }
    return body;
  };

  const useExistingPatientFromPhoneConflict = (existing: PatientPhoneConflictPatient) => {
    const item: PickListItem = {
      value: existing.id,
      label: `${existing.firstNameEn} ${existing.lastNameEn}`.trim(),
      hint: existing.mrn,
    };
    setBookPatientMode("existing");
    setPatientId(existing.id);
    setSelectedBookPatientItem(item);
    setProvisionalFirstName("");
    setProvisionalLastName("");
    setProvisionalPhone("");
    setProvisionalPhoneConflict(null);
    toast.success(
      t(
        "appointments.switchedToExistingPatient",
        "Using existing patient {{name}} ({{mrn}}). Finish booking below.",
        {
          name: `${existing.firstNameEn} ${existing.lastNameEn}`.trim(),
          mrn: existing.mrn,
        },
      ),
    );
  };

  const createMut = useMutation({
    mutationFn: (confirmOverlap: boolean) => {
      const issues = collectAppointmentCreateIssues(appointmentCreateInput, t);
      if (!visitType.trim()) {
        issues.push(t("encounters.errorVisitTypeRequired", "Select a visit type."));
      }
      if (!patientLocked && bookPatientMode === "new" && provisionalPhoneConflict) {
        issues.push(phoneConflictMessage(provisionalPhoneConflict, t, i18n.language));
      }
      if (issues.length > 0) throw new Error(issues.join(" "));
      if (canSetAppointmentFees) {
        const trimmedFee = bookFee.trim();
        const fee = trimmedFee !== "" ? Number.parseFloat(trimmedFee) : NaN;
        const planErr =
          Number.isFinite(fee) && fee > 0 ? validateScheduledFeeCollection(fee, bookFeeCollection, t) : null;
        if (planErr) throw new Error(planErr);
      }
      return apiPost<AppointmentDto>("/api/v1/appointments", buildCreateBody(confirmOverlap));
    },
    onSuccess: (apt) => {
      validation.clear();
      setShowOverlapConfirm(false);
      setOverlapConflicts([]);
      toast.success(t("appointments.bookedOk", "Appointment created."));
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      if (lockedPatientId) void qc.invalidateQueries({ queryKey: ["patient", lockedPatientId] });
      onOpenChange(false);
      if (navigateOnSuccess && apt?.id) navigate(`/appointments/${apt.id}`);
    },
    onError: (e: unknown) => {
      const conflict = parsePhoneConflictFromError(e);
      if (conflict) {
        setProvisionalPhoneConflict(conflict);
        validation.showIssues([phoneConflictMessage(conflict, t, i18n.language)]);
        return;
      }
      validation.showError(e);
    },
  });

  const validateStep = (s: WizardStep): string[] => {
    if (s === 1) {
      const issues: string[] = [];
      if (!clinicId.trim()) issues.push(t("appointments.errorClinicRequired", "Select a clinic."));
      if (patientLocked) {
        if (!(patientId || lockedPatientId)?.trim()) {
          issues.push(t("appointments.errorPatientRequired", "Select a patient."));
        }
      } else if (bookPatientMode === "new") {
        if (!provisionalFirstName.trim() || !provisionalLastName.trim()) {
          issues.push(
            t("appointments.errorProvisionalNameRequired", "Enter the new patient's first and last name."),
          );
        }
        if (!provisionalPhone.trim()) {
          issues.push(
            t("appointments.errorProvisionalPhoneRequired", "Enter a phone number for the new patient."),
          );
        }
        if (provisionalPhoneConflict) {
          issues.push(phoneConflictMessage(provisionalPhoneConflict, t, i18n.language));
        }
      } else if (!patientId.trim()) {
        issues.push(t("appointments.errorPatientRequired", "Select a patient."));
      }
      if (!isPhysician && !clinicianId.trim()) {
        issues.push(t("appointments.errorClinicianRequired", "Select a clinician."));
      }
      return issues;
    }
    if (s === 2) {
      const issues = collectAppointmentCreateIssues(
        {
          clinicId: "x",
          patientId: "x",
          clinicianId: "x",
          start,
          end,
          openingTime: clinicOpeningTime,
        },
        t,
      );
      if (!visitType.trim()) {
        issues.push(t("encounters.errorVisitTypeRequired", "Select a visit type."));
      }
      return issues;
    }
    return [];
  };

  const goNext = () => {
    const issues = validateStep(step);
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    validation.clear();
    setStep((prev) => (prev < 3 ? ((prev + 1) as WizardStep) : prev));
  };

  const goBack = () => {
    validation.clear();
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  };

  const handleSubmit = async () => {
    const step1 = validateStep(1);
    const step2 = validateStep(2);
    const issues = [...step1, ...step2];
    if (issues.length > 0) {
      validation.showIssues(issues);
      if (step1.length) setStep(1);
      else if (step2.length) setStep(2);
      return;
    }
    validation.clear();
    try {
      const params = new URLSearchParams({
        clinicianId,
        startsAt: toAppointmentIso(start),
      });
      if (end.trim()) params.set("endsAt", toAppointmentIso(end));
      const conflicts = await apiGet<AppointmentDto[]>(
        `/api/v1/appointments/scheduling-conflicts?${params.toString()}`,
      );
      if (conflicts.length > 0) {
        setOverlapConflicts(conflicts);
        setShowOverlapConfirm(true);
        return;
      }
      createMut.mutate(false);
    } catch (e) {
      const conflict = parsePhoneConflictFromError(e);
      if (conflict) {
        setProvisionalPhoneConflict(conflict);
        validation.showIssues([phoneConflictMessage(conflict, t, i18n.language)]);
        setStep(1);
        return;
      }
      validation.showError(e);
    }
  };

  const steps = [
    {
      n: 1 as const,
      title: t("appointments.wizardStepPeople", "People & clinic"),
      hint: t("appointments.wizardStepPeopleHint", "Patient, clinic, and attending doctor"),
    },
    {
      n: 2 as const,
      title: t("appointments.wizardStepSchedule", "Schedule & type"),
      hint: t("appointments.wizardStepScheduleHint", "Date, time, and visit type"),
    },
    {
      n: 3 as const,
      title: t("appointments.wizardStepConfirm", "Fee & confirm"),
      hint: t("appointments.wizardStepConfirmHint", "Review fees and create the booking"),
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
        <CreateWizardDialogContent>
          <CreateWizardHeader
            icon={<CalendarPlus className="size-5" aria-hidden />}
            title={t("appointments.wizardTitle", "New appointment")}
            subtitle={t(
              "appointments.wizardSubtitle",
              "Book a visit in a few guided steps. Required fields are marked.",
            )}
            steps={steps}
            step={step}
            stepsAriaLabel={t("appointments.wizardAria", "Appointment booking steps")}
            stepLabel={(n) => t("appointments.wizardStepLabel", "Step {{n}}", { n })}
            onStepSelect={(n) => {
              if (n < step) {
                validation.clear();
                setStep(n as 1 | 2 | 3);
              } else if (n === step + 1) {
                goNext();
              }
            }}
          />

          <CreateWizardBody>
            {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label required>{t("appointments.clinic")}</Label>
                  <SearchablePickList
                    items={clinicItems}
                    value={clinicId}
                    onValueChange={setClinicId}
                    searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                    placeholder={t("appointments.pick")}
                  />
                </div>

                <div className="space-y-2">
                  <Label required>{t("appointments.patient")}</Label>
                  {patientLocked ? (
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                      <p className="font-medium text-foreground">
                        {bookPatientSelectedItem?.label ?? lockedPatientLabel ?? patientId}
                      </p>
                      {bookPatientSelectedItem?.hint ? (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground ltr-nums">
                          {bookPatientSelectedItem.hint}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={bookPatientMode === "existing" ? "default" : "outline"}
                          onClick={() => setBookPatientMode("existing")}
                        >
                          {t("appointments.existingPatient", "Existing patient")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={bookPatientMode === "new" ? "default" : "outline"}
                          onClick={() => {
                            setBookPatientMode("new");
                            setPatientId("");
                            setSelectedBookPatientItem(null);
                          }}
                        >
                          {t("appointments.newPatientBooking", "New patient (first visit)")}
                        </Button>
                      </div>
                      {bookPatientMode === "existing" ? (
                        <>
                          <p className="text-xs text-muted-foreground">{t("encounters.selectPatientHint")}</p>
                          <SearchablePickList
                            items={bookPatientItems}
                            value={patientId}
                            selectedItem={bookPatientSelectedItem}
                            onValueChange={(id, item) => {
                              setPatientId(id);
                              if (item) setSelectedBookPatientItem(item);
                              else {
                                const fromList = bookPatientItems.find((p) => p.value === id);
                                if (fromList) setSelectedBookPatientItem(fromList);
                              }
                            }}
                            onSearchQueryChange={bookPatientPickSearch.setSearch}
                            onOpen={bookPatientPickSearch.handleOpen}
                            searchPlaceholder={t("encounters.patientSearchPlaceholder")}
                            placeholder={t("appointments.pick")}
                            emptyMessage={
                              bookPatientsPending
                                ? t("common.loading")
                                : t("encounters.noPatientsMatch", "No patients match.")
                            }
                            localFilter={false}
                            minSearchLength={1}
                            idleMessage={t(
                              "encounters.patientSearchIdle",
                              "Start typing to show matching patients.",
                            )}
                          />
                        </>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            {t(
                              "appointments.provisionalBookingHint",
                              "Book with name and phone only. Finish the patient profile before check-in, starting an encounter, or marking the visit complete. No-shows never require a full chart.",
                            )}
                          </p>
                          <div className="space-y-2">
                            <Label required>{t("patients.firstNameEn")}</Label>
                            <Input
                              value={provisionalFirstName}
                              onChange={(e) => setProvisionalFirstName(e.target.value)}
                              autoComplete="given-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label required>{t("patients.lastNameEn")}</Label>
                            <Input
                              value={provisionalLastName}
                              onChange={(e) => setProvisionalLastName(e.target.value)}
                              autoComplete="family-name"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <PatientPhoneField
                              value={provisionalPhone}
                              onChange={setProvisionalPhone}
                              enabled={open && bookPatientMode === "new"}
                              externalConflict={provisionalPhoneConflict}
                              onConflictChange={setProvisionalPhoneConflict}
                              onUseExisting={useExistingPatientFromPhoneConflict}
                              useExistingLabel={t(
                                "appointments.phoneConflictBookExisting",
                                "Book with this patient",
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!isPhysician ? (
                  <div className="space-y-2">
                    <Label required>{t("appointments.clinician")}</Label>
                    <SearchablePickList
                      items={physicianItems}
                      value={clinicianId}
                      selectedItem={bookPhysicianSelectedItem}
                      onValueChange={(id, item) => {
                        setClinicianId(id);
                        if (item) setPinnedPhysicianItem(item);
                        else {
                          const fromList = physicianItems.find((d) => d.value === id);
                          if (fromList) setPinnedPhysicianItem(fromList);
                        }
                      }}
                      onSearchQueryChange={bookDoctorPickSearch.setSearch}
                      onOpen={bookDoctorPickSearch.handleOpen}
                      searchPlaceholder={t(
                        "appointments.filterPhysician",
                        "Type physician name, Arabic name, or email…",
                      )}
                      placeholder={t("appointments.pickPhysician")}
                      emptyMessage={
                        physiciansFetching && physicianItems.length === 0
                          ? t("common.loading")
                          : t("appointments.noPhysicians", "No physicians found.")
                      }
                      localFilter={false}
                      minSearchLength={0}
                      idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    <Stethoscope className="size-4 shrink-0" aria-hidden />
                    {t("appointments.wizardSelfClinician", "You are the attending doctor for this booking.")}
                  </div>
                )}
                <VisitModeSelector clinicianId={isPhysician ? (clinicianId || authUser?.id || "") : clinicianId} value={visitMode} onChange={setVisitMode} />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label required>{t("appointments.starts")}</Label>
                  <DatetimeLocalField
                    value={start}
                    onChange={setStart}
                    minTime={clinicOpeningTime}
                    stepSeconds={APPOINTMENT_SLOT_MINUTES * 60}
                    defaultTime={clinicOpeningTime}
                  />
                  <p className="text-xs text-muted-foreground">
                    {clinicId.trim()
                      ? t(
                          "appointments.startClinicHoursHint",
                          "Clinic hours: {{hours}}. Each slot is {{minutes}} minutes unless you set a custom end time.",
                          {
                            hours: formatClinicHoursRange(
                              clinicOpeningTime,
                              clinicClosingTime,
                              bookHoursLocale,
                            ),
                            minutes: APPOINTMENT_SLOT_MINUTES,
                          },
                        )
                      : t(
                          "appointments.startMinHint",
                          "Select a clinic to apply its opening hours. Each slot is {{minutes}} minutes unless you set a custom end time.",
                          { minutes: APPOINTMENT_SLOT_MINUTES },
                        )}
                  </p>
                  {bookingAfterClosing ? (
                    <div className="rounded-lg border border-[hsl(var(--warning)/0.5)] bg-amber-500/10 px-3 py-2.5 text-sm text-[hsl(var(--warning))]">
                      {t(
                        "appointments.afterClosingWarning",
                        "This appointment is after the clinic closing time ({{time}}). You can still book it, but please confirm this is intentional.",
                        { time: formatClinicTimeLabel(clinicClosingTime, bookHoursLocale) },
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>{t("appointments.ends")}</Label>
                  <DatetimeLocalField
                    value={end}
                    onChange={setEnd}
                    minTime={clinicOpeningTime}
                    stepSeconds={APPOINTMENT_SLOT_MINUTES * 60}
                    defaultTime={clinicOpeningTime}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "appointments.endAutoHint",
                      "Prefilled to {{minutes}} minutes after start — clear or change if the visit duration differs.",
                      { minutes: APPOINTMENT_SLOT_MINUTES },
                    )}
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label required>{t("encounters.visitType")}</Label>
                  <select
                    className={nativeSelectClassName}
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value)}
                  >
                    {ENCOUNTER_VISIT_TYPES.map((vt) => (
                      <option key={vt} value={vt}>
                        {formatVisitType(vt, t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("appointments.wizardReview", "Booking summary")}
                  </p>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">{t("appointments.patient")}</dt>
                      <dd className="font-medium">
                        {bookPatientSelectedItem?.label ??
                          (bookPatientMode === "new"
                            ? `${provisionalFirstName} ${provisionalLastName}`.trim()
                            : "—")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("appointments.clinician")}</dt>
                      <dd className="font-medium">
                        {bookPhysicianSelectedItem?.label ??
                          (isPhysician ? t("appointments.wizardSelfClinicianShort", "You") : "—")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("appointments.clinic")}</dt>
                      <dd className="font-medium">
                        {clinicItems.find((c) => c.value === clinicId)?.label ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("encounters.visitType")}</dt>
                      <dd className="font-medium">{formatVisitType(visitType, t)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{t("appointments.starts")}</dt>
                      <dd className="font-medium ltr-nums">
                        {start
                          ? new Date(start).toLocaleString(localeForLanguage(i18n.language))
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {canSetAppointmentFees ? (
                  <div className="space-y-2">
                    <Label>
                      {t("appointments.scheduledFee", "Scheduled fee ({{currency}})", {
                        currency: bookFeeCurrency,
                      })}
                    </Label>
                    <Input
                      className="ltr-nums max-w-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      value={bookFee}
                      onChange={(e) => setBookFee(e.target.value)}
                    />
                    <ScheduledFeeCollectionFields
                      className="max-w-lg"
                      feeAmount={Number.parseFloat(bookFee.trim()) > 0 ? Number.parseFloat(bookFee.trim()) : 0}
                      value={bookFeeCollection}
                      onChange={setBookFeeCollection}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "appointments.scheduledFeeHiddenRole",
                      "Scheduled fees use organization defaults for your role. An administrator can enable fee fields per user.",
                    )}
                  </p>
                )}
              </div>
            ) : null}
          </CreateWizardBody>

          <CreateWizardFooter
            cancelLabel={t("common.cancel", "Cancel")}
            backLabel={t("appointments.wizardBack", "Back")}
            continueLabel={t("appointments.wizardNext", "Continue")}
            step={step}
            maxStep={3}
            pending={createMut.isPending}
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            onContinue={goNext}
            submit={
              <CreateActionButton
                type="button"
                disabled={createMut.isPending}
                onClick={() => void handleSubmit()}
              >
                {t("appointments.create")}
              </CreateActionButton>
            }
          />
        </CreateWizardDialogContent>
      </Dialog>

      <AppointmentOverlapConfirmDialog
        open={showOverlapConfirm}
        conflicts={overlapConflicts}
        pending={createMut.isPending}
        onOpenChange={(next) => {
          setShowOverlapConfirm(next);
          if (!next) setOverlapConflicts([]);
        }}
        onConfirm={() => createMut.mutate(true)}
      />
      <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}
