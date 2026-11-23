import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import {
  CreateWizardBody,
  CreateWizardDialogContent,
  CreateWizardFooter,
  CreateWizardHeader,
} from "@/components/create-wizard-chrome";
import {
  emptyPatientAcquisitionFormValues,
  patientAcquisitionFormToBody,
  type PatientAcquisitionFormValues,
} from "@/components/patient-acquisition-form";
import { PatientAcquisitionFields } from "@/components/patient-acquisition-fields";
import { PatientAllergiesField } from "@/components/patient-allergies-field";
import { PatientPhoneField } from "@/components/patient-phone-field";
import { PendingDocumentAttachments } from "@/components/pending-document-attachments";
import {
  pendingDocumentDescription,
  type PendingDocumentRow,
} from "@/components/pending-document-utils";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import {
  fetchPatientsList,
  patientsListQueryKey,
  useClinicsQuery,
} from "@/lib/api-hooks";
import type { PatientDto } from "@/lib/api-schema";
import { collectPatientRegisterValidationIssues } from "@/lib/create-form-validation";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiPost, apiPostFormData } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import { allergiesFormToApi, type PatientAllergyFormItem } from "@/lib/patient-allergies";
import {
  parsePhoneConflictFromError,
  phoneConflictMessage,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { useAuthStore } from "@/stores/auth-store";

type WizardStep = 1 | 2 | 3;

export type PatientRegisterWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** List page size used when refreshing after create. */
  listPageSize?: number;
  /** Called after a successful create (before list refresh). */
  onRegistered?: () => void;
};

function WizardSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PatientRegisterWizard({
  open,
  onOpenChange,
  listPageSize = 10,
  onRegistered,
}: PatientRegisterWizardProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const authRole = useAuthStore((s) => s.user?.role);
  const validation = useValidationIssuesDialog({ intent: "create" });
  const createInFlightRef = useRef(false);

  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const defaultHomeBranchId = singleManagedClinic?.id ?? clinics[0]?.id ?? "";

  const [step, setStep] = useState<WizardStep>(1);
  const [firstNameEn, setFirstNameEn] = useState("");
  const [lastNameEn, setLastNameEn] = useState("");
  const [firstNameAr, setFirstNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [phone, setPhone] = useState("");
  const [phoneConflict, setPhoneConflict] = useState<PatientPhoneConflictPatient | null>(null);
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nationalIdDocFile, setNationalIdDocFile] = useState<File | null>(null);
  const [homeBranchId, setHomeBranchId] = useState("");
  const [docRows, setDocRows] = useState<PendingDocumentRow[]>([]);
  const [allergyItems, setAllergyItems] = useState<PatientAllergyFormItem[]>([]);
  const [acquisition, setAcquisition] = useState<PatientAcquisitionFormValues>(
    emptyPatientAcquisitionFormValues(),
  );
  const [docInvalidRowIds, setDocInvalidRowIds] = useState<Set<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(() => new Set());

  const resetForm = () => {
    setStep(1);
    setFirstNameEn("");
    setLastNameEn("");
    setFirstNameAr("");
    setLastNameAr("");
    setDob("");
    setGender("M");
    setPhone("");
    setPhoneConflict(null);
    setEmail("");
    setNationalId("");
    setNationalIdDocFile(null);
    setHomeBranchId(defaultHomeBranchId);
    setDocRows([]);
    setAllergyItems([]);
    setAcquisition(emptyPatientAcquisitionFormValues());
    setDocInvalidRowIds(new Set());
    setFieldErrors(new Set());
    validation.clear();
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && defaultHomeBranchId && !homeBranchId) {
      setHomeBranchId(defaultHomeBranchId);
    }
  }, [open, defaultHomeBranchId, homeBranchId]);

  const registerInput = () => ({
    firstNameEn,
    lastNameEn,
    firstNameAr,
    lastNameAr,
    dob,
    gender,
    phone,
    email,
    nationalId,
    homeBranchId,
    isVip: false,
    needsChaperone: false,
    acquisition,
    docRows,
  });

  const fieldInvalid = (key: string) => fieldErrors.has(key);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const validateStep = (s: WizardStep): { issues: string[]; invalidDocRowIds: Set<string> } => {
    if (s === 1) {
      const issues: string[] = [];
      if (!firstNameEn.trim() || !lastNameEn.trim()) {
        issues.push(t("patients.errorNameRequired", "English first and last name are required."));
      }
      if (!firstNameAr.trim()) {
        issues.push(t("patients.errorFirstNameAr", "Arabic first name is required."));
      }
      if (!lastNameAr.trim()) {
        issues.push(t("patients.errorLastNameAr", "Arabic last name is required."));
      }
      return { issues, invalidDocRowIds: new Set() };
    }
    if (s === 2) {
      const issues: string[] = [];
      if (!phone.trim()) {
        issues.push(t("patients.errorPhoneRequired", "Phone is required."));
      }
      if (phoneConflict) {
        issues.push(phoneConflictMessage(phoneConflict, t, i18n.language));
      }
      return { issues, invalidDocRowIds: new Set() };
    }
    return collectPatientRegisterValidationIssues(registerInput(), t);
  };

  const markStepFieldErrors = (s: WizardStep) => {
    const errors = new Set<string>();
    if (s === 1) {
      if (!firstNameEn.trim()) errors.add("firstNameEn");
      if (!lastNameEn.trim()) errors.add("lastNameEn");
      if (!firstNameAr.trim()) errors.add("firstNameAr");
      if (!lastNameAr.trim()) errors.add("lastNameAr");
    } else if (s === 2) {
      if (!phone.trim() || phoneConflict) errors.add("phone");
    }
    setFieldErrors(errors);
  };

  const showStepIssues = (s: WizardStep, issues: string[], invalidDocRowIds = new Set<string>()) => {
    markStepFieldErrors(s);
    setDocInvalidRowIds(invalidDocRowIds);
    validation.showIssues(issues);
  };

  const goNext = () => {
    const { issues, invalidDocRowIds } = validateStep(step);
    if (issues.length) {
      showStepIssues(step, issues, invalidDocRowIds);
      return;
    }
    setFieldErrors(new Set());
    setDocInvalidRowIds(new Set());
    validation.clear();
    setStep((prev) => (prev < 3 ? ((prev + 1) as WizardStep) : prev));
  };

  const goBack = () => {
    validation.clear();
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const result = collectPatientRegisterValidationIssues(registerInput(), t);
      if (result.issues.length > 0) throw new Error(result.issues.join(" "));

      const allergies = allergiesFormToApi(allergyItems);
      const body: Record<string, unknown> = {
        firstNameEn,
        lastNameEn,
        firstNameAr: firstNameAr.trim(),
        lastNameAr: lastNameAr.trim(),
        ...(dob.trim() ? { dob: dob.trim() } : {}),
        gender,
        phone: phone.trim(),
        email: email.trim() || undefined,
        nationalId: nationalId.trim() || undefined,
        homeBranchId: homeBranchId || undefined,
        ...(allergies.length ? { allergies } : {}),
      };
      Object.assign(body, patientAcquisitionFormToBody(acquisition));

      const patient = await apiPost<PatientDto>("/api/v1/patients", body);
      if (nationalIdDocFile) {
        const fd = new FormData();
        fd.append("file", nationalIdDocFile);
        await apiPostFormData<PatientDto>(`/api/v1/patients/${patient.id}/national-id-document`, fd);
      }
      for (const row of docRows) {
        if (row.files.length === 0) continue;
        const description = pendingDocumentDescription(row, t);
        if (!description.trim()) {
          throw new Error(t("patients.errorDocCategoryRequired", "Each attached document needs a type."));
        }
        for (const file of row.files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("description", description);
          await apiPostFormData(`/api/v1/patients/${patient.id}/documents`, fd);
        }
      }
      return patient;
    },
    onSettled: () => {
      createInFlightRef.current = false;
    },
    onSuccess: async () => {
      validation.clear();
      setDocInvalidRowIds(new Set());
      onOpenChange(false);
      resetForm();
      onRegistered?.();
      toast.success(t("patients.createSuccess", "Patient registered."));

      const listParams = {
        page: 1,
        pageSize: listPageSize,
        sortBy: "createdAt",
        sortOrder: "desc" as const,
        search: "",
      };
      await qc.fetchQuery({
        queryKey: patientsListQueryKey(listParams),
        queryFn: () => fetchPatientsList(listParams),
      });
      await qc.invalidateQueries({ queryKey: ["patients"] });
      await qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      const conflict = parsePhoneConflictFromError(e);
      if (conflict) {
        setPhoneConflict(conflict);
        setStep(2);
        showStepIssues(2, [phoneConflictMessage(conflict, t, i18n.language)]);
        return;
      }
      validation.showError(e);
      showStepIssues(step, [apiErrorMessage(e)]);
    },
  });

  const handleSubmit = () => {
    if (createInFlightRef.current || createMut.isPending) return;

    const step1 = validateStep(1);
    const step2 = validateStep(2);
    const step3 = validateStep(3);
    if (step1.issues.length) {
      setStep(1);
      showStepIssues(1, step1.issues);
      return;
    }
    if (step2.issues.length) {
      setStep(2);
      showStepIssues(2, step2.issues);
      return;
    }
    if (step3.issues.length) {
      setStep(3);
      showStepIssues(3, step3.issues, step3.invalidDocRowIds);
      return;
    }

    setFieldErrors(new Set());
    setDocInvalidRowIds(new Set());
    validation.clear();
    createInFlightRef.current = true;
    createMut.mutate();
  };

  const steps = [
    {
      n: 1 as const,
      title: t("patients.wizardStepIdentity", "Identity"),
      hint: t("patients.wizardStepIdentityHint", "Names, date of birth, and gender"),
    },
    {
      n: 2 as const,
      title: t("patients.wizardStepContact", "Contact & clinic"),
      hint: t("patients.wizardStepContactHint", "Phone, ID, email, and home branch"),
    },
    {
      n: 3 as const,
      title: t("patients.wizardStepContext", "Context & confirm"),
      hint: t("patients.wizardStepContextHint", "Allergies, documents, and how they found us"),
    },
  ];

  const inputRing = (key: string) =>
    fieldInvalid(key) ? "border-destructive ring-1 ring-destructive" : undefined;

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
            icon={<UserPlus className="size-5" aria-hidden />}
            title={t("patients.registerTitle")}
            subtitle={t(
              "patients.wizardSubtitle",
              "Register a patient in a few guided steps. Required fields are marked.",
            )}
            steps={steps}
            step={step}
            stepsAriaLabel={t("patients.wizardAria", "Patient registration steps")}
            stepLabel={(n) => t("patients.wizardStepLabel", "Step {{n}}", { n })}
            onStepSelect={(n) => {
              if (n < step) {
                validation.clear();
                setStep(n as WizardStep);
              } else if (n === step + 1) {
                goNext();
              }
            }}
          />

          <CreateWizardBody>
            {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <WizardSection
                  title={t("patients.wizardSectionNamesEn", "English name")}
                  hint={t("patients.wizardSectionNamesEnHint", "Used on charts, invoices, and search.")}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label required>{t("patients.firstNameEn")}</Label>
                      <Input
                        className={cn(inputRing("firstNameEn"))}
                        value={firstNameEn}
                        onChange={(e) => {
                          setFirstNameEn(e.target.value);
                          clearFieldError("firstNameEn");
                        }}
                        autoComplete="given-name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label required>{t("patients.lastNameEn")}</Label>
                      <Input
                        className={cn(inputRing("lastNameEn"))}
                        value={lastNameEn}
                        onChange={(e) => {
                          setLastNameEn(e.target.value);
                          clearFieldError("lastNameEn");
                        }}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                </WizardSection>

                <WizardSection
                  title={t("patients.wizardSectionNamesAr", "Arabic name")}
                  hint={t("patients.wizardSectionNamesArHint", "Required for Arabic charts and printouts.")}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label required>{t("patients.firstNameAr")}</Label>
                      <Input
                        className={cn(inputRing("firstNameAr"))}
                        value={firstNameAr}
                        onChange={(e) => {
                          setFirstNameAr(e.target.value);
                          clearFieldError("firstNameAr");
                        }}
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label required>{t("patients.lastNameAr")}</Label>
                      <Input
                        className={cn(inputRing("lastNameAr"))}
                        value={lastNameAr}
                        onChange={(e) => {
                          setLastNameAr(e.target.value);
                          clearFieldError("lastNameAr");
                        }}
                        dir="rtl"
                      />
                    </div>
                  </div>
                </WizardSection>

                <WizardSection title={t("patients.wizardSectionDemographics", "Demographics")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label optional>{t("patients.dob")}</Label>
                      <Input
                        className="ltr-nums"
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("patients.gender")}</Label>
                      <select
                        className={nativeSelectClassName}
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                      >
                        <option value="M">{t("patients.genderM")}</option>
                        <option value="F">{t("patients.genderF")}</option>
                      </select>
                    </div>
                  </div>
                </WizardSection>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "patients.wizardSectionPhoneHint",
                      "Primary contact number. Duplicate numbers are flagged before save.",
                    )}
                  </p>
                  <PatientPhoneField
                    value={phone}
                    onChange={(next) => {
                      setPhone(next);
                      clearFieldError("phone");
                    }}
                    enabled={open}
                    externalConflict={phoneConflict}
                    onConflictChange={setPhoneConflict}
                  />
                </section>

                <WizardSection
                  title={t("patients.wizardSectionIdEmail", "ID & email")}
                  hint={t("patients.wizardSectionIdEmailHint", "Optional national ID scan and email.")}
                >
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label optional>{t("patients.nationalId")}</Label>
                      <Input
                        className="ltr-nums"
                        value={nationalId}
                        onChange={(e) => setNationalId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label optional>{t("patients.nationalIdDocument")}</Label>
                      <Input
                        className="cursor-pointer text-sm"
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => setNationalIdDocFile(e.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">{t("patients.nationalIdDocumentHint")}</p>
                      {nationalIdDocFile ? (
                        <p className="text-xs text-muted-foreground ltr-nums">{nationalIdDocFile.name}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label optional>{t("patients.email")}</Label>
                      <Input
                        type="text"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                  </div>
                </WizardSection>

                <WizardSection title={t("patients.homeBranch")}>
                  {singleManagedClinic ? (
                    <p className="rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm">
                      {formatClinicName(singleManagedClinic, i18n.language)}{" "}
                      <span className="text-muted-foreground">
                        (
                        {authRole === "branch_manager"
                          ? t("admin.managedClinicBm", "your clinic")
                          : t("admin.managedClinicCa", "assigned clinic")}
                        )
                      </span>
                    </p>
                  ) : (
                    <select
                      className={nativeSelectClassName}
                      value={homeBranchId}
                      onChange={(e) => setHomeBranchId(e.target.value)}
                    >
                      <option value="">{t("patients.optionalBranch")}</option>
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>
                          {formatClinicName(c, i18n.language)}
                        </option>
                      ))}
                    </select>
                  )}
                </WizardSection>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "patients.wizardSectionAllergiesHint",
                      "Optional now — you can update allergies later from the chart.",
                    )}
                  </p>
                  <PatientAllergiesField value={allergyItems} onChange={setAllergyItems} />
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                  <PendingDocumentAttachments
                    rows={docRows}
                    invalidRowIds={docInvalidRowIds}
                    onChange={(next) => {
                      setDocRows(next);
                      setDocInvalidRowIds(new Set());
                    }}
                  />
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "patients.wizardSectionAcquisitionHint",
                      "Required so the clinic can track where new patients come from.",
                    )}
                  </p>
                  <PatientAcquisitionFields required values={acquisition} onChange={setAcquisition} />
                </section>
              </div>
            ) : null}
          </CreateWizardBody>

          <CreateWizardFooter
            cancelLabel={t("common.cancel", "Cancel")}
            backLabel={t("patients.wizardBack", "Back")}
            continueLabel={t("patients.wizardNext", "Continue")}
            step={step}
            maxStep={3}
            pending={createMut.isPending}
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            onContinue={goNext}
            submit={
              <CreateActionButton type="button" disabled={createMut.isPending} onClick={handleSubmit}>
                {t("patients.submitRegister")}
              </CreateActionButton>
            }
          />
        </CreateWizardDialogContent>
      </Dialog>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </>
  );
}
