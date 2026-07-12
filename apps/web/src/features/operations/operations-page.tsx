import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import {
  MedicationsPrescriptionDraftPanel,
  resetMedicationsPrescriptionDraft,
  type MedTab,
  type PendingMedication,
} from "@/components/medications-prescription-draft-panel";
import {
  PendingDocumentAttachments,
  pendingDocumentDescription,
  type PendingDocumentRow,
} from "@/components/pending-document-attachments";
import { OperationStatusBadge } from "@/components/operation-status-badge";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useClinicsQuery,
  useOperationQuery,
  useOperationsQuery,
  usePatientsQuery,
  usePatientQuery,
  useSchedulingPhysiciansQuery,
} from "@/lib/api-hooks";
import type { OperationDetailDto, OperationDocumentDto, OperationDto } from "@/lib/api-types";
import { ApiError, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { canAdminEditCompletedOperation } from "@/lib/operation-admin-policy";
import { resolvePatientListLabel, patientToPickListItem } from "@/lib/patient-display";
import { formatClinicianDisplayName } from "@/lib/employee-display";
import { physicianToPickListItem } from "@/lib/physician-display";
import { formatClinicName, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount, resolveClinicCurrencyCode } from "@/lib/money-display";
import { columnFilterIncludes } from "@/lib/utils";
import { useDebouncedPickListSearch } from "@/lib/pick-list-utils";
import { useAuthStore } from "@/stores/auth-store";
import { defaultMonthRange } from "@/stores/date-range-store";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectOperationCreateValidationIssues } from "@/features/operations/operation-form-validation";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { nativeSelectClassName } from "@/lib/form-control-styles";

const CREATE_ROLES = new Set([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "clinic_assistant",
  "receptionist",
]);

function toOperationIso(localDatetime: string): string {
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d.toISOString();
}

function operationDetailToMedState(detail: OperationDetailDto): {
  medTab: MedTab;
  medications: PendingMedication[];
  hasExistingPrescription: boolean;
  existingAttachments: OperationDocumentDto[];
} {
  const existingAttachments = detail.documents.filter((d) => d.kind === "ATTACHMENT");
  const hasExistingPrescription = detail.documents.some((d) => d.kind === "PRESCRIPTION");
  const medications = detail.medications.map((m) => ({
    id: crypto.randomUUID(),
    drugName: m.drugName,
    dosage: m.dosage ?? "",
    frequency: m.frequency ?? "",
  }));
  if (detail.noMedications) {
    return { medTab: "none", medications: [], hasExistingPrescription: false, existingAttachments };
  }
  if (hasExistingPrescription) {
    return { medTab: "prescription", medications, hasExistingPrescription: true, existingAttachments };
  }
  if (medications.length > 0) {
    return { medTab: "manual", medications, hasExistingPrescription: false, existingAttachments };
  }
  return { medTab: "none", medications: [], hasExistingPrescription: false, existingAttachments };
}

export function OperationsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canCreate = authUser?.role ? CREATE_ROLES.has(authUser.role) : false;
  const canAdminEditCompleted = canAdminEditCompletedOperation(authUser?.role);
  const isPhysician = authUser?.role === "physician";

  const initialRange = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [filterClinicId, setFilterClinicId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("operationDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const { data: opData, isPending, isError, error } = useOperationsQuery({
    from,
    to,
    page,
    pageSize,
    sortBy,
    sortOrder,
    clinicId: filterClinicId || undefined,
  });

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const rows = opData?.items ?? [];
  const opTotal = opData?.total ?? 0;
  const opTotalPages = opData?.totalPages ?? 1;

  const { data: clinics = [] } = useClinicsQuery();
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const clinicById = useMemo(() => {
    const m = new Map<string, { en: string; ar: string }>();
    for (const c of clinics) m.set(c.id, { en: c.nameEn, ar: c.nameAr });
    return m;
  }, [clinics]);

  const { data: patData } = usePatientsQuery({ page: 1, pageSize: 200 });
  const patients = patData?.items ?? [];
  const patientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, `${p.mrn} — ${p.firstNameEn} ${p.lastNameEn}`);
    return m;
  }, [patients]);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [feeCurrency, setFeeCurrency] = useState("AED");
  const [comments, setComments] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);
  const createValidation = useValidationIssuesDialog({ intent: "create" });
  const [docInvalidRowIds, setDocInvalidRowIds] = useState<Set<string>>(() => new Set());
  const [docRows, setDocRows] = useState<PendingDocumentRow[]>([]);
  const [medTab, setMedTab] = useState<MedTab>("none");
  const [medications, setMedications] = useState<PendingMedication[]>([]);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [generatedPrescriptionFile, setGeneratedPrescriptionFile] = useState<File | null>(null);
  const [pinnedPhysicianItem, setPinnedPhysicianItem] = useState<PickListItem | null>(null);

  const bookPatientPickSearch = useDebouncedPickListSearch();
  const bookDoctorPickSearch = useDebouncedPickListSearch();

  const schedulingClinicId = clinicId || singleManagedClinic?.id || "";

  const { data: bookPatData, isPending: bookPatientsPending } = usePatientsQuery({
    search: bookPatientPickSearch.debounced.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: showCreatePanel,
  });
  const bookPatients = bookPatData?.items ?? [];
  const selectedPatient = useMemo(
    () => bookPatients.find((p) => p.id === patientId) ?? patients.find((p) => p.id === patientId),
    [bookPatients, patients, patientId],
  );
  const effectiveSchedulingClinicId = schedulingClinicId || selectedPatient?.homeBranchId || "";
  const { data: physicians = [], isFetching: physiciansFetching } = useSchedulingPhysiciansQuery({
    clinicId: effectiveSchedulingClinicId || undefined,
    search: bookDoctorPickSearch.debounced.trim() || undefined,
    enabled: showCreatePanel,
  });

  const bookPatientItems: PickListItem[] = useMemo(
    () => bookPatients.map((p) => patientToPickListItem(p)),
    [bookPatients],
  );

  const physicianItems: PickListItem[] = useMemo(
    () => physicians.map((d) => physicianToPickListItem(d, i18n.language)),
    [physicians, i18n.language],
  );

  const createPatientMissingFromList = Boolean(
    patientId && !bookPatientItems.some((p) => p.value === patientId),
  );
  const { data: createPatientDetail } = usePatientQuery(
    showCreatePanel && createPatientMissingFromList ? patientId : undefined,
  );
  const bookPatientSelectedItem = useMemo((): PickListItem | null => {
    if (!patientId) return null;
    const fromList = bookPatientItems.find((p) => p.value === patientId);
    if (fromList) return fromList;
    if (selectedPatient) return patientToPickListItem(selectedPatient);
    if (createPatientDetail) return patientToPickListItem(createPatientDetail);
    return null;
  }, [patientId, bookPatientItems, selectedPatient, createPatientDetail]);

  const selectedPhysician = useMemo(
    () => physicians.find((d) => d.userId === clinicianId),
    [physicians, clinicianId],
  );
  const bookPhysicianSelectedItem = useMemo((): PickListItem | null => {
    if (!clinicianId) return null;
    if (pinnedPhysicianItem?.value === clinicianId) return pinnedPhysicianItem;
    const fromList = physicianItems.find((d) => d.value === clinicianId);
    if (fromList) return fromList;
    if (selectedPhysician) {
      return physicianToPickListItem(selectedPhysician, i18n.language);
    }
    return null;
  }, [clinicianId, pinnedPhysicianItem, physicianItems, selectedPhysician, i18n.language]);
  const selectedClinic = useMemo(() => {
    const id = schedulingClinicId || selectedPatient?.homeBranchId || clinics[0]?.id;
    return clinics.find((c) => c.id === id) ?? clinics[0];
  }, [schedulingClinicId, selectedPatient?.homeBranchId, clinics]);
  const createCurrency = resolveClinicCurrencyCode(clinics, selectedClinic?.id);

  useEffect(() => {
    if (showCreatePanel) setFeeCurrency(createCurrency);
  }, [showCreatePanel, createCurrency]);

  const prescriptionContext = useMemo(
    () => ({
      clinicName: selectedClinic ? formatClinicName(selectedClinic, i18n.language) : "—",
      patientName: selectedPatient
        ? `${selectedPatient.firstNameEn} ${selectedPatient.lastNameEn}`.trim()
        : "—",
      patientMrn: selectedPatient?.mrn,
      physicianName: selectedPhysician
        ? physicianToPickListItem(selectedPhysician, i18n.language).label
        : authUser?.displayName ?? null,
    }),
    [selectedClinic, selectedPatient, selectedPhysician, authUser?.displayName, i18n.language],
  );

  const resetCreateForm = () => {
    setPatientId("");
    bookPatientPickSearch.resetSearch();
    setClinicianId("");
    setPinnedPhysicianItem(null);
    bookDoctorPickSearch.resetSearch();
    setOperationDate("");
    setTotalCost("");
    setDownPayment("");
    setFeeCurrency(createCurrency);
    setComments("");
    setDocRows([]);
    setDocInvalidRowIds(new Set());
    createValidation.clear();
    const medReset = resetMedicationsPrescriptionDraft();
    setMedTab(medReset.medTab);
    setMedications(medReset.medications);
    setPrescriptionFile(medReset.prescriptionFile);
    setGeneratedPrescriptionFile(medReset.generatedPrescriptionFile);
  };

  const [efPatient, setEfPatient] = useState("");
  const [efDoctor, setEfDoctor] = useState("");
  const [efDate, setEfDate] = useState("");
  const [efTotal, setEfTotal] = useState("");
  const [efDown, setEfDown] = useState("");
  const [efStatus, setEfStatus] = useState("");
  const [completeConfirmOp, setCompleteConfirmOp] = useState<OperationDto | null>(null);
  const [completeCollectionAmount, setCompleteCollectionAmount] = useState("");
  const [completeFormErr, setCompleteFormErr] = useState<string | null>(null);
  const [editOp, setEditOp] = useState<OperationDto | null>(null);
  const [editPatientId, setEditPatientId] = useState("");
  const [editClinicianId, setEditClinicianId] = useState("");
  const [editOperationDate, setEditOperationDate] = useState("");
  const [editTotalCost, setEditTotalCost] = useState("");
  const [editDownPayment, setEditDownPayment] = useState("");
  const [editFeeCurrency, setEditFeeCurrency] = useState("AED");
  const [editComments, setEditComments] = useState("");
  const [editClinicId, setEditClinicId] = useState("");
  const [editFormErr, setEditFormErr] = useState<string | null>(null);
  const [editDocRows, setEditDocRows] = useState<PendingDocumentRow[]>([]);
  const [editDocInvalidRowIds, setEditDocInvalidRowIds] = useState<Set<string>>(() => new Set());
  const [editMedTab, setEditMedTab] = useState<MedTab>("none");
  const [editMedications, setEditMedications] = useState<PendingMedication[]>([]);
  const [editPrescriptionFile, setEditPrescriptionFile] = useState<File | null>(null);
  const [editGeneratedPrescriptionFile, setEditGeneratedPrescriptionFile] = useState<File | null>(null);
  const [editHadExistingPrescription, setEditHadExistingPrescription] = useState(false);
  const [editExistingAttachments, setEditExistingAttachments] = useState<OperationDocumentDto[]>([]);
  const [editDetailLoadedId, setEditDetailLoadedId] = useState<string | null>(null);
  const editValidation = useValidationIssuesDialog({ intent: "save" });
  const editPatientPickSearch = useDebouncedPickListSearch();
  const editDoctorPickSearch = useDebouncedPickListSearch();

  const resetEditClinicalForm = () => {
    setEditDocRows([]);
    setEditDocInvalidRowIds(new Set());
    setEditHadExistingPrescription(false);
    setEditExistingAttachments([]);
    setEditDetailLoadedId(null);
    editValidation.clear();
    const medReset = resetMedicationsPrescriptionDraft();
    setEditMedTab(medReset.medTab);
    setEditMedications(medReset.medications);
    setEditPrescriptionFile(medReset.prescriptionFile);
    setEditGeneratedPrescriptionFile(medReset.generatedPrescriptionFile);
  };

  const closeEditDialog = () => {
    setEditOp(null);
    resetEditClinicalForm();
    setEditFormErr(null);
  };

  const openEdit = (o: OperationDto) => {
    resetEditClinicalForm();
    setEditOp(o);
    setEditPatientId(o.patientId);
    setEditClinicianId(o.clinicianId);
    setEditClinicId(o.clinicId);
    const d = new Date(o.operationDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditOperationDate(local);
    setEditTotalCost(String(o.totalCost));
    setEditDownPayment(String(o.downPayment));
    setEditFeeCurrency(o.feeCurrency ?? resolveClinicCurrencyCode(clinics, o.clinicId));
    setEditComments(o.comments ?? "");
    setEditFormErr(null);
    editPatientPickSearch.resetSearch();
    editDoctorPickSearch.resetSearch();
  };

  const editIsScheduled = editOp?.status === "SCHEDULED";
  const { data: editOpDetail, isPending: editOpDetailPending } = useOperationQuery(
    editIsScheduled ? editOp?.id : undefined,
  );
  const editClinicDefaultCurrency = resolveClinicCurrencyCode(clinics, editClinicId || editOp?.clinicId);

  useEffect(() => {
    if (!editIsScheduled || !editOpDetail || editDetailLoadedId === editOpDetail.id) return;
    const medState = operationDetailToMedState(editOpDetail);
    setEditMedTab(medState.medTab);
    setEditMedications(medState.medications);
    setEditHadExistingPrescription(medState.hasExistingPrescription);
    setEditExistingAttachments(medState.existingAttachments);
    setEditPrescriptionFile(null);
    setEditGeneratedPrescriptionFile(null);
    setEditFeeCurrency(editOpDetail.feeCurrency ?? editClinicDefaultCurrency);
    setEditDetailLoadedId(editOpDetail.id);
  }, [editIsScheduled, editOpDetail, editDetailLoadedId, editClinicDefaultCurrency]);

  const { data: editPhysicians = [], isFetching: editPhysiciansFetching } = useSchedulingPhysiciansQuery({
    clinicId: editClinicId || editOp?.clinicId || undefined,
    search: editDoctorPickSearch.debounced.trim() || undefined,
    enabled: editOp != null,
  });
  const { data: editPatData, isPending: editPatientsPending } = usePatientsQuery({
    search: editPatientPickSearch.debounced.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: editOp != null,
  });
  const editPatients = editPatData?.items ?? [];
  const { data: editPatientDetail } = usePatientQuery(editOp ? editPatientId : undefined);
  const editPatientItems: PickListItem[] = useMemo(
    () => editPatients.map((p) => patientToPickListItem(p)),
    [editPatients]
  );
  const editPhysicianItems: PickListItem[] = useMemo(
    () => editPhysicians.map((d) => physicianToPickListItem(d, i18n.language)),
    [editPhysicians, i18n.language],
  );
  const editPatientSelectedItem = useMemo((): PickListItem | null => {
    if (!editPatientId) return null;
    const fromList = editPatientItems.find((p) => p.value === editPatientId);
    if (fromList) return fromList;
    if (editPatientDetail) return patientToPickListItem(editPatientDetail);
    if (editOp) {
      const resolved = resolvePatientListLabel({
        patientId: editOp.patientId,
        patientMrn: editOp.patientMrn,
        patientName: editOp.patientName,
      });
      if (!resolved.isIdFallback) return { value: editPatientId, label: resolved.text };
    }
    return null;
  }, [editPatientId, editPatientItems, editPatientDetail, editOp]);
  const editPhysicianSelectedItem = useMemo((): PickListItem | null => {
    if (!editClinicianId) return null;
    const fromList = editPhysicianItems.find((d) => d.value === editClinicianId);
    if (fromList) return fromList;
    if (editOp?.clinicianName) return { value: editClinicianId, label: editOp.clinicianName };
    return null;
  }, [editClinicianId, editPhysicianItems, editOp?.clinicianName]);

  const editSelectedClinic = useMemo(
    () => clinics.find((c) => c.id === (editClinicId || editOp?.clinicId)),
    [clinics, editClinicId, editOp?.clinicId],
  );
  const editPrescriptionContext = useMemo(
    () => ({
      clinicName: editSelectedClinic ? formatClinicName(editSelectedClinic, i18n.language) : "—",
      patientName: editPatientSelectedItem?.label ?? "—",
      patientMrn: editOpDetail?.patientMrn ?? editOp?.patientMrn,
      physicianName: editPhysicianSelectedItem?.label ?? null,
    }),
    [
      editSelectedClinic,
      editPatientSelectedItem,
      editOpDetail?.patientMrn,
      editOp?.patientMrn,
      editPhysicianSelectedItem,
      i18n.language,
    ],
  );

  useEffect(() => {
    if (singleManagedClinic) {
      setClinicId(singleManagedClinic.id);
      setFilterClinicId(singleManagedClinic.id);
    }
  }, [singleManagedClinic?.id]);

  const filteredRows = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    return rows.filter((o) => {
      if (efPatient.trim()) {
        const pText = resolvePatientListLabel({
          patientId: o.patientId,
          patientMrn: o.patientMrn,
          patientName: o.patientName,
          registryLabel: patientLabel.get(o.patientId),
        }).text;
        if (!columnFilterIncludes(pText, efPatient)) return false;
      }
      if (efDoctor.trim() && !columnFilterIncludes(o.clinicianName ?? o.clinicianId, efDoctor)) return false;
      if (efDate.trim()) {
        const ds = new Date(o.operationDate).toLocaleString(loc);
        if (!columnFilterIncludes(ds, efDate) && !columnFilterIncludes(o.operationDate, efDate)) return false;
      }
      if (efTotal.trim() && !columnFilterIncludes(String(o.totalCost), efTotal)) return false;
      if (efDown.trim() && !columnFilterIncludes(String(o.downPayment), efDown)) return false;
      if (efStatus.trim() && !columnFilterIncludes(o.status, efStatus)) return false;
      return true;
    });
  }, [rows, efPatient, efDoctor, efDate, efTotal, efDown, efStatus, i18n.language, patientLabel]);

  const openCompleteDialog = (o: OperationDto) => {
    const balance = Math.max(0, o.balanceDue ?? o.totalCost - (o.paidAmount ?? o.downPayment));
    setCompleteConfirmOp(o);
    setCompleteCollectionAmount(balance > 0.001 ? String(balance) : "");
    setCompleteFormErr(null);
  };

  const completeCurrency = completeConfirmOp?.feeCurrency ?? resolveClinicCurrencyCode(clinics, completeConfirmOp?.clinicId);
  const completeBalance = completeConfirmOp
    ? Math.max(0, completeConfirmOp.balanceDue ?? completeConfirmOp.totalCost - (completeConfirmOp.paidAmount ?? completeConfirmOp.downPayment))
    : 0;
  const completeCollectionN = Number.parseFloat(completeCollectionAmount || "0");
  const completeCollectionValid =
    completeBalance <= 0.001 ||
    (Number.isFinite(completeCollectionN) &&
      completeCollectionN > 0 &&
      Math.abs(completeCollectionN - completeBalance) < 0.001);

  const statusMut = useMutation({
    mutationFn: ({
      id,
      status,
      collectionAmount,
    }: {
      id: string;
      status: "COMPLETED" | "CANCELLED";
      collectionAmount?: number;
    }) =>
      apiPatch<OperationDto>(`/api/v1/operations/${id}/status`, {
        status,
        ...(collectionAmount !== undefined ? { collectionAmount } : {}),
      }),
    onSuccess: () => {
      setCompleteConfirmOp(null);
      setCompleteCollectionAmount("");
      setCompleteFormErr(null);
      void qc.invalidateQueries({ queryKey: ["operations"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setCompleteFormErr(String((e.body as { message?: unknown }).message));
      } else setCompleteFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editOp) throw new Error("No operation selected");
      const op = await apiPatch<OperationDto>(`/api/v1/operations/${editOp.id}`, {
        patientId: editPatientId,
        clinicianId: editClinicianId,
        operationDate: toOperationIso(editOperationDate),
        totalCost: Number.parseFloat(editTotalCost),
        downPayment: editDownPayment.trim() ? Number.parseFloat(editDownPayment) : 0,
        comments: editComments.trim() || undefined,
        clinicId: editClinicId || undefined,
        feeCurrency: editFeeCurrency,
        ...(editIsScheduled ? { noMedications: editMedTab === "none" } : {}),
      });

      if (!editIsScheduled) return op;

      const keepExistingPrescription =
        editMedTab === "prescription" &&
        editHadExistingPrescription &&
        !editPrescriptionFile &&
        !editGeneratedPrescriptionFile;

      await apiPost(`/api/v1/operations/${editOp.id}/reset-clinical`, {
        clearPrescription: !keepExistingPrescription,
      });

      for (const row of editDocRows) {
        const description = pendingDocumentDescription(row, t);
        for (const file of row.files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("kind", "ATTACHMENT");
          fd.append("description", description);
          await apiPostFormData(`/api/v1/operations/${editOp.id}/documents`, fd);
        }
      }

      if (editMedTab !== "none") {
        for (const m of editMedications) {
          await apiPost(`/api/v1/operations/${editOp.id}/medications`, {
            drugName: m.drugName,
            dosage: m.dosage.trim() || undefined,
            frequency: m.frequency.trim() || undefined,
          });
        }
        const rxFile =
          editMedTab === "prescription"
            ? editPrescriptionFile ?? editGeneratedPrescriptionFile
            : editGeneratedPrescriptionFile;
        if (rxFile) {
          const fd = new FormData();
          fd.append("file", rxFile);
          fd.append("kind", "PRESCRIPTION");
          await apiPostFormData(`/api/v1/operations/${editOp.id}/documents`, fd);
        }
      }

      return op;
    },
    onSuccess: () => {
      setEditFormErr(null);
      closeEditDialog();
      void qc.invalidateQueries({ queryKey: ["operations"] });
      void qc.invalidateQueries({ queryKey: ["operation"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setEditFormErr(String((e.body as { message?: unknown }).message));
      } else setEditFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const showEditValidationIssues = (issues: string[], invalidDocRowIds = new Set<string>()) => {
    setEditDocInvalidRowIds(invalidDocRowIds);
    editValidation.showIssues(issues);
  };

  const handleEditClick = () => {
    if (!editOp) return;
    if (editIsScheduled) {
      const validation = collectOperationCreateValidationIssues(
        {
          patientId: editPatientId,
          clinicianId: editClinicianId,
          operationDate: editOperationDate,
          totalCost: editTotalCost,
          downPayment: editDownPayment,
          docRows: editDocRows,
          medTab: editMedTab,
          prescriptionFile: editPrescriptionFile,
          generatedPrescriptionFile: editGeneratedPrescriptionFile,
          hasExistingPrescription: editHadExistingPrescription,
        },
        t,
      );
      if (validation.issues.length > 0) {
        showEditValidationIssues(validation.issues, validation.invalidDocRowIds);
        return;
      }
      setEditDocInvalidRowIds(new Set());
      editValidation.clear();
    }
    setEditFormErr(null);
    editMut.mutate();
  };

  const showCreateValidationIssues = (issues: string[], invalidDocRowIds = new Set<string>()) => {
    setDocInvalidRowIds(invalidDocRowIds);
    createValidation.showIssues(issues);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const op = await apiPost<OperationDto>("/api/v1/operations", {
        patientId,
        clinicianId,
        operationDate: toOperationIso(operationDate),
        totalCost: Number.parseFloat(totalCost),
        downPayment: downPayment.trim() ? Number.parseFloat(downPayment) : 0,
        comments: comments.trim() || undefined,
        clinicId: schedulingClinicId || undefined,
        noMedications: medTab === "none",
        feeCurrency,
      });

      for (const row of docRows) {
        const description = pendingDocumentDescription(row, t);
        for (const file of row.files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("kind", "ATTACHMENT");
          fd.append("description", description);
          await apiPostFormData(`/api/v1/operations/${op.id}/documents`, fd);
        }
      }

      if (medTab !== "none") {
        for (const m of medications) {
          await apiPost(`/api/v1/operations/${op.id}/medications`, {
            drugName: m.drugName,
            dosage: m.dosage.trim() || undefined,
            frequency: m.frequency.trim() || undefined,
          });
        }
        const rxFile =
          medTab === "prescription"
            ? prescriptionFile ?? generatedPrescriptionFile
            : generatedPrescriptionFile;
        if (rxFile) {
          const fd = new FormData();
          fd.append("file", rxFile);
          fd.append("kind", "PRESCRIPTION");
          await apiPostFormData(`/api/v1/operations/${op.id}/documents`, fd);
        }
      }

      return op;
    },
    onSuccess: () => {
      setFormErr(null);
      setCreateOk(t("operations.created", "Operation scheduled."));
      void qc.invalidateQueries({ queryKey: ["operations"] });
      resetCreateForm();
    },
    onError: (e: unknown) => {
      setCreateOk(null);
      createValidation.showError(e);
    },
  });

  const handleCreateClick = () => {
    const validation = collectOperationCreateValidationIssues(
      {
        patientId,
        clinicianId,
        operationDate,
        totalCost,
        downPayment,
        docRows,
        medTab,
        prescriptionFile,
        generatedPrescriptionFile,
      },
      t,
    );
    if (validation.issues.length > 0) {
      showCreateValidationIssues(validation.issues, validation.invalidDocRowIds);
      return;
    }
    setFormErr(null);
    setDocInvalidRowIds(new Set());
    createMut.mutate();
  };

  const loc = localeForLanguage(i18n.language);
  const listCurrency = resolveClinicCurrencyCode(
    clinics,
    filterClinicId || singleManagedClinic?.id || rows[0]?.clinicId,
  );
  const money = (n: number, currency?: string) => formatMoneyAmount(n, currency ?? listCurrency, loc);

  return (
    <div className="space-y-6">
      <ValidationIssuesDialog {...createValidation.dialogProps} />
      <Dialog
        open={completeConfirmOp != null}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteConfirmOp(null);
            setCompleteCollectionAmount("");
            setCompleteFormErr(null);
          }
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-w-md border-amber-200/80 dark:border-amber-900/50">
          <div className="space-y-4">
            <DialogHeader className="space-y-3 text-start">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <Lock className="size-5" aria-hidden />
              </div>
              <DialogTitle className="text-start text-xl">
                {t("operations.confirmCompleteTitle", "Mark operation as completed?")}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t(
                "operations.confirmCompleteBody",
                "Collect any remaining balance below. The full operation cost is posted to revenue only when you mark it complete."
              )}
            </p>
            {completeConfirmOp ? (
              <div className="space-y-3 text-sm">
                <p className="font-medium">
                  {resolvePatientListLabel({
                    patientId: completeConfirmOp.patientId,
                    patientMrn: completeConfirmOp.patientMrn,
                    patientName: completeConfirmOp.patientName,
                    registryLabel: patientLabel.get(completeConfirmOp.patientId),
                  }).text}
                </p>
                <div className="grid gap-1 rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">
                  <p>
                    {t("operations.totalCost", "Total cost ({{currency}})", { currency: completeCurrency })}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.totalCost, completeCurrency)}</span>
                  </p>
                  <p>
                    {t("operations.downPayment", "Down payment ({{currency}})", { currency: completeCurrency })}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.downPayment, completeCurrency)}</span>
                  </p>
                  <p>
                    {t("operations.paidAmount", "Paid ({{currency}})", { currency: completeCurrency })}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.paidAmount ?? 0, completeCurrency)}</span>
                  </p>
                  <p className="font-medium text-foreground">
                    {t("operations.confirmCompleteRemaining", "Remaining to collect")}: {money(completeBalance, completeCurrency)}
                  </p>
                </div>
                {completeBalance > 0.001 ? (
                  <div className="space-y-1">
                    <Label htmlFor="complete-collection" required>
                      {t("operations.collectRemaining", "Amount collected now ({{currency}})", {
                        currency: completeCurrency,
                      })}
                    </Label>
                    <Input
                      id="complete-collection"
                      className="ltr-nums"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={completeCollectionAmount}
                      onChange={(e) => {
                        setCompleteCollectionAmount(e.target.value);
                        setCompleteFormErr(null);
                      }}
                      placeholder={money(completeBalance, completeCurrency)}
                    />
                    {!completeCollectionValid && completeCollectionAmount.trim() ? (
                      <p className="text-xs text-destructive">
                        {t("operations.collectRemainingHint", "Enter the full remaining amount to continue.")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "operations.confirmCompleteRevenueNote",
                    "On completion, {{amount}} {{currency}} will be added to clinic revenue.",
                    { amount: money(completeConfirmOp.totalCost, completeCurrency), currency: completeCurrency }
                  )}
                </p>
              </div>
            ) : null}
            {completeFormErr ? <p className="text-sm text-destructive">{completeFormErr}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCompleteConfirmOp(null);
                  setCompleteCollectionAmount("");
                  setCompleteFormErr(null);
                }}
                disabled={statusMut.isPending}
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                disabled={statusMut.isPending || !completeConfirmOp || !completeCollectionValid}
                onClick={() => {
                  if (!completeConfirmOp) return;
                  statusMut.mutate({
                    id: completeConfirmOp.id,
                    status: "COMPLETED",
                    ...(completeBalance > 0.001 ? { collectionAmount: completeCollectionN } : {}),
                  });
                }}
              >
                {t("operations.markCompleted", "Mark completed")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ValidationIssuesDialog {...editValidation.dialogProps} />
      <Dialog open={editOp != null} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent
          className="flex w-[min(100%-2rem,48rem)] max-h-[min(90dvh,40rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
          aria-describedby={undefined}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pe-14 sm:px-6">
            <DialogTitle>
              {editOp?.status === "COMPLETED"
                ? t("operations.editCompletedTitle", "Edit completed operation")
                : t("operations.editTitle", "Edit operation")}
            </DialogTitle>
            {editOp?.status === "COMPLETED" ? (
              <p className="text-sm font-normal text-muted-foreground">
                {t(
                  "operations.editCompletedHint",
                  "Administrator correction — you can update details and re-assign the performing doctor. Linked revenue is updated automatically.",
                )}
              </p>
            ) : null}
          </DialogHeader>
          {editOp ? (
            <>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                {editIsScheduled && editOpDetailPending ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
                ) : null}

                <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                  <legend className="px-1 text-sm font-medium">{t("operations.sectionWhen", "When & where")}</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="edit-op-date" required>
                        {t("operations.operationDate", "Operation date")}
                      </Label>
                      <DatetimeLocalField id="edit-op-date" value={editOperationDate} onChange={setEditOperationDate} />
                    </div>
                    {clinics.length > 1 ? (
                      <div className="space-y-1">
                        <Label htmlFor="edit-op-clinic">{t("operations.clinic", "Clinic")}</Label>
                        <select
                          id="edit-op-clinic"
                          className={nativeSelectClassName}
                          value={editClinicId}
                          onChange={(e) => {
                            setEditClinicId(e.target.value);
                            setEditClinicianId("");
                            setEditFeeCurrency(resolveClinicCurrencyCode(clinics, e.target.value));
                          }}
                        >
                          {clinics.map((c) => (
                            <option key={c.id} value={c.id}>
                              {formatClinicName(c, i18n.language)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                  <legend className="px-1 text-sm font-medium">{t("operations.sectionPeople", "Patient & doctor")}</legend>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label required>{t("operations.patient", "Patient")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("encounters.selectPatientHint", "Search by name or MRN, then choose a row.")}
                      </p>
                      <SearchablePickList
                        items={editPatientItems}
                        value={editPatientId}
                        selectedItem={editPatientSelectedItem}
                        onValueChange={setEditPatientId}
                        onSearchQueryChange={editPatientPickSearch.setSearch}
                        onOpen={editPatientPickSearch.resetSearch}
                        searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                        placeholder={t("operations.selectPatient", "Select patient")}
                        emptyMessage={
                          editPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                        }
                        localFilter={false}
                        minSearchLength={1}
                        idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label required>{t("operations.doctor", "Performing doctor")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("operations.doctorHint", "Doctors assigned to the selected clinic. Type a name to filter.")}
                      </p>
                      <SearchablePickList
                        items={editPhysicianItems}
                        value={editClinicianId}
                        selectedItem={editPhysicianSelectedItem}
                        onValueChange={setEditClinicianId}
                        onSearchQueryChange={editDoctorPickSearch.setSearch}
                        onOpen={editDoctorPickSearch.resetSearch}
                        searchPlaceholder={t("appointments.filterPhysician", "Type physician name…")}
                        placeholder={t("operations.selectDoctor", "Select doctor")}
                        emptyMessage={
                          editPhysiciansFetching && editPhysicianItems.length === 0
                            ? t("common.loading")
                            : t("operations.noDoctors", "No physicians found.")
                        }
                        localFilter={false}
                        minSearchLength={0}
                        idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                  <legend className="px-1 text-sm font-medium">{t("operations.sectionPayment", "Cost & payment")}</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="edit-op-total" required>
                        {t("operations.totalCost", "Total cost ({{currency}})", { currency: editFeeCurrency })}
                      </Label>
                      <Input
                        id="edit-op-total"
                        className="ltr-nums bg-background"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={editTotalCost}
                        onChange={(e) => setEditTotalCost(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-op-down">
                        {t("operations.downPayment", "Down payment ({{currency}})", { currency: editFeeCurrency })}
                      </Label>
                      <Input
                        id="edit-op-down"
                        className="ltr-nums bg-background"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={editDownPayment}
                        onChange={(e) => setEditDownPayment(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-op-fee-currency">{t("operations.paymentCurrency", "Payment currency")}</Label>
                    <BaseCurrencySelect
                      id="edit-op-fee-currency"
                      value={editFeeCurrency}
                      onChange={setEditFeeCurrency}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "operations.paymentCurrencyHint",
                        "Defaults to the clinic currency ({{currency}}). Choose another if the patient paid in a different currency.",
                        { currency: editClinicDefaultCurrency },
                      )}
                    </p>
                  </div>
                  {(editOp.paidAmount ?? 0) > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("operations.paidAmount", "Paid ({{currency}})", { currency: editFeeCurrency })}:{" "}
                      {money(editOp.paidAmount ?? 0, editFeeCurrency)} ·{" "}
                      {t("operations.balanceDue", "Balance ({{currency}})", { currency: editFeeCurrency })}:{" "}
                      {money(editOp.balanceDue ?? 0, editFeeCurrency)}
                    </p>
                  ) : null}
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                  <legend className="px-1 text-sm font-medium">{t("operations.comments", "Comments")}</legend>
                  <Textarea
                    id="edit-op-comments"
                    className="bg-background"
                    rows={3}
                    value={editComments}
                    onChange={(e) => setEditComments(e.target.value)}
                    placeholder={t("operations.commentsPlaceholder", "Notes about the procedure…")}
                  />
                </fieldset>

                {editIsScheduled && !editOpDetailPending ? (
                  <>
                    {editExistingAttachments.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-border p-3 sm:p-4">
                        <p className="text-sm font-medium">{t("operations.existingDocuments", "Saved documents")}</p>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {editExistingAttachments.map((doc) => (
                            <li key={doc.id}>{doc.description || doc.originalFileName}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                      <legend className="px-1 text-sm font-medium">{t("patients.attachDocuments", "Documents")}</legend>
                      <PendingDocumentAttachments
                        rows={editDocRows}
                        onChange={(next) => {
                          setEditDocRows(next);
                          if (editDocInvalidRowIds.size > 0) setEditDocInvalidRowIds(new Set());
                        }}
                        invalidRowIds={editDocInvalidRowIds.size > 0 ? editDocInvalidRowIds : undefined}
                      />
                    </fieldset>
                    <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                      <legend className="px-1 text-sm font-medium">{t("encounters.medications")}</legend>
                      {editHadExistingPrescription && editMedTab === "prescription" && !editPrescriptionFile ? (
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "operations.existingPrescriptionHint",
                            "A prescription is already on file. Upload a new file to replace it.",
                          )}
                        </p>
                      ) : null}
                      <MedicationsPrescriptionDraftPanel
                        medTab={editMedTab}
                        onMedTabChange={setEditMedTab}
                        medications={editMedications}
                        onMedicationsChange={setEditMedications}
                        prescriptionFile={editPrescriptionFile}
                        onPrescriptionFileChange={setEditPrescriptionFile}
                        generatedPrescriptionFile={editGeneratedPrescriptionFile}
                        onGeneratedPrescriptionFileChange={setEditGeneratedPrescriptionFile}
                        prescriptionContext={editPrescriptionContext}
                      />
                    </fieldset>
                  </>
                ) : null}

                {editFormErr ? <p className="text-sm text-destructive">{editFormErr}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                <Button type="button" variant="outline" onClick={closeEditDialog} disabled={editMut.isPending}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    editMut.isPending ||
                    (editIsScheduled && editOpDetailPending) ||
                    !editPatientId ||
                    !editClinicianId ||
                    !editOperationDate ||
                    !editTotalCost.trim() ||
                    Number.isNaN(Number.parseFloat(editTotalCost))
                  }
                  onClick={handleEditClick}
                >
                  {t("operations.saveChanges", "Save changes")}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("operations.title", "Operations")}</h1>
        <p className="text-sm text-muted-foreground">
          {isPhysician
            ? t("operations.subtitlePhysician", "Procedures assigned to you.")
            : t("operations.subtitle", "Schedule and track surgical procedures.")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("dateRange.label", "Reporting period")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="op-from">{t("dateRange.from", "From")}</Label>
            <Input id="op-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-to">{t("dateRange.to", "To")}</Label>
            <Input id="op-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          {clinics.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="op-clinic-filter">{t("operations.clinic", "Clinic")}</Label>
              <select
                id="op-clinic-filter"
                className={`${nativeSelectClassName} min-w-[180px]`}
                value={filterClinicId}
                onChange={(e) => { setFilterClinicId(e.target.value); setPage(1); }}
              >
                <option value="">{t("operations.allClinics", "All clinics")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClinicName(c, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canCreate ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{t("operations.schedule", "Schedule operation")}</CardTitle>
            <CreateActionButton type="button" onClick={() => setShowCreatePanel((v) => !v)}>
              {showCreatePanel ? t("common.hide", "Hide") : t("operations.new", "New operation")}
            </CreateActionButton>
          </CardHeader>
          {showCreatePanel ? (
            <CardContent className="space-y-6 overflow-visible">
              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionWhen", "When & where")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="op-date" required>{t("operations.operationDate", "Operation date")}</Label>
                    <DatetimeLocalField id="op-date" value={operationDate} onChange={setOperationDate} />
                  </div>
                  {clinics.length > 1 ? (
                    <div className="space-y-1">
                      <Label htmlFor="op-clinic">{t("operations.clinic", "Clinic")}</Label>
                      <select
                        id="op-clinic"
                        className={nativeSelectClassName}
                        value={clinicId}
                        onChange={(e) => {
                          setClinicId(e.target.value);
                          setClinicianId("");
                          setFeeCurrency(resolveClinicCurrencyCode(clinics, e.target.value || undefined));
                        }}
                      >
                        <option value="">{t("operations.autoClinic", "Patient home branch")}</option>
                        {clinics.map((c) => (
                          <option key={c.id} value={c.id}>
                            {formatClinicName(c, i18n.language)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionPeople", "Patient & doctor")}</legend>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label required>{t("operations.patient", "Patient")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("encounters.selectPatientHint", "Search by name or MRN, then choose a row.")}
                    </p>
                    <SearchablePickList
                      items={bookPatientItems}
                      value={patientId}
                      selectedItem={bookPatientSelectedItem}
                      onValueChange={setPatientId}
                      onSearchQueryChange={bookPatientPickSearch.setSearch}
                      onOpen={bookPatientPickSearch.resetSearch}
                      searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                      placeholder={t("operations.selectPatient", "Select patient")}
                      emptyMessage={
                        bookPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                      }
                      localFilter={false}
                      minSearchLength={1}
                      idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label required>{t("operations.doctor", "Performing doctor")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("operations.doctorHint", "Doctors assigned to the selected clinic. Type a name to filter.")}
                    </p>
                    <SearchablePickList
                      items={physicianItems}
                      value={clinicianId}
                      selectedItem={bookPhysicianSelectedItem}
                      onValueChange={(id) => {
                        setClinicianId(id);
                        const item = physicianItems.find((d) => d.value === id);
                        if (item) setPinnedPhysicianItem(item);
                      }}
                      onSearchQueryChange={bookDoctorPickSearch.setSearch}
                      onOpen={bookDoctorPickSearch.resetSearch}
                      searchPlaceholder={t("appointments.filterPhysician", "Type physician name, Arabic name, or email…")}
                      placeholder={t("operations.selectDoctor", "Select doctor")}
                      emptyMessage={
                        physiciansFetching && physicianItems.length === 0
                          ? t("common.loading")
                          : t("operations.noDoctors", "No physicians found.")
                      }
                      localFilter={false}
                      minSearchLength={0}
                      idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionPayment", "Cost & payment")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="op-total" required>
                      {t("operations.totalCost", "Total cost ({{currency}})", { currency: feeCurrency })}
                    </Label>
                    <Input
                      id="op-total"
                      className="ltr-nums bg-background"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={totalCost}
                      onChange={(e) => setTotalCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="op-down">
                      {t("operations.downPayment", "Down payment ({{currency}})", { currency: feeCurrency })}
                    </Label>
                    <Input
                      id="op-down"
                      className="ltr-nums bg-background"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op-fee-currency">{t("operations.paymentCurrency", "Payment currency")}</Label>
                  <BaseCurrencySelect id="op-fee-currency" value={feeCurrency} onChange={setFeeCurrency} />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "operations.paymentCurrencyHint",
                      "Defaults to the clinic currency ({{currency}}). Choose another if the patient paid in a different currency.",
                      { currency: createCurrency },
                    )}
                  </p>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.comments", "Comments")}</legend>
                <Textarea
                  id="op-comments"
                  className="bg-background"
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={t("operations.commentsPlaceholder", "Notes about the procedure…")}
                />
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("patients.attachDocuments", "Documents")}</legend>
                <PendingDocumentAttachments
                  rows={docRows}
                  onChange={(next) => {
                    setDocRows(next);
                    if (docInvalidRowIds.size > 0) setDocInvalidRowIds(new Set());
                  }}
                  invalidRowIds={docInvalidRowIds.size > 0 ? docInvalidRowIds : undefined}
                />
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("encounters.medications")}</legend>
                <MedicationsPrescriptionDraftPanel
                  medTab={medTab}
                  onMedTabChange={setMedTab}
                  medications={medications}
                  onMedicationsChange={setMedications}
                  prescriptionFile={prescriptionFile}
                  onPrescriptionFileChange={setPrescriptionFile}
                  generatedPrescriptionFile={generatedPrescriptionFile}
                  onGeneratedPrescriptionFileChange={setGeneratedPrescriptionFile}
                  prescriptionContext={prescriptionContext}
                />
              </fieldset>

              {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}
              {createOk ? <p className="text-sm text-emerald-600">{createOk}</p> : null}
              <CreateActionButton
                type="button"
                disabled={createMut.isPending}
                onClick={handleCreateClick}
              >
                {t("operations.save", "Save operation")}
              </CreateActionButton>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isPhysician
              ? t("operations.myOperations", "My operations")
              : t("operations.list", "Scheduled operations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p>
          ) : (
            <>
              <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortableTh
                      label={t("operations.operationDate", "Operation date")}
                      column="operationDate"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      filterValue={efDate}
                      onFilterChange={setEfDate}
                    />
                    <FilterTh
                      label={t("operations.patient", "Patient")}
                      value={efPatient}
                      onChange={setEfPatient}
                    />
                    <FilterTh
                      label={t("operations.doctor", "Performing doctor")}
                      value={efDoctor}
                      onChange={setEfDoctor}
                    />
                    <SortableTh
                      label={t("operations.totalCost", "Total cost ({{currency}})", { currency: listCurrency })}
                      column="totalCost"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      filterValue={efTotal}
                      onFilterChange={setEfTotal}
                    />
                    <SortableTh
                      label={t("operations.downPayment", "Down payment ({{currency}})", { currency: listCurrency })}
                      column="downPayment"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      filterValue={efDown}
                      onFilterChange={setEfDown}
                    />
                    <th className="px-3 py-2 text-start font-medium">
                      {t("operations.paidAmount", "Paid ({{currency}})", { currency: listCurrency })}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("operations.balanceDue", "Balance ({{currency}})", { currency: listCurrency })}
                    </th>
                    <SortableTh
                      label={t("operations.status", "Status")}
                      column="status"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      filterValue={efStatus}
                      onFilterChange={setEfStatus}
                    />
                    <th className="px-3 py-2 text-start font-medium">{t("operations.comments", "Comments")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("common.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        {t("operations.empty", "No operations in this period.")}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((o) => {
                      const clinic = clinicById.get(o.clinicId);
                      const clinicLabel = clinic ? formatClinicName({ nameEn: clinic.en, nameAr: clinic.ar }, i18n.language) : null;
                      const patientResolved = resolvePatientListLabel({
                        patientId: o.patientId,
                        patientMrn: o.patientMrn,
                        patientName: o.patientName,
                        registryLabel: patientLabel.get(o.patientId),
                      });
                      return (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="px-3 py-2 align-top">
                            <div>{new Date(o.operationDate).toLocaleString(loc)}</div>
                            {clinicLabel ? (
                              <div className="text-xs text-muted-foreground">{clinicLabel}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {patientResolved.isIdFallback ? (
                              <span className="font-mono text-xs text-muted-foreground ltr-nums">{patientResolved.text}</span>
                            ) : (
                              patientResolved.text
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">{formatClinicianDisplayName(o, i18n.language)}</td>
                          <td className="px-3 py-2 align-top ltr-nums">
                            {money(o.totalCost, o.feeCurrency ?? listCurrency)}
                          </td>
                          <td className="px-3 py-2 align-top ltr-nums">
                            {money(o.downPayment, o.feeCurrency ?? listCurrency)}
                          </td>
                          <td className="px-3 py-2 align-top">{money(o.paidAmount ?? 0, o.feeCurrency ?? listCurrency)}</td>
                          <td className="px-3 py-2 align-top">{money(o.balanceDue ?? o.totalCost - (o.paidAmount ?? 0), o.feeCurrency ?? listCurrency)}</td>
                          <td className="px-3 py-2 align-top">
                            <OperationStatusBadge status={o.status ?? "SCHEDULED"} />
                          </td>
                          <td className="max-w-[200px] px-3 py-2 align-top text-muted-foreground">
                            {o.comments?.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-end">
                            {o.status === "SCHEDULED" ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={statusMut.isPending || editMut.isPending}
                                  onClick={() => openEdit(o)}
                                >
                                  {t("operations.edit", "Edit")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={statusMut.isPending}
                                  onClick={() => openCompleteDialog(o)}
                                >
                                  {t("operations.markCompleted", "Mark completed")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={statusMut.isPending}
                                  onClick={() => statusMut.mutate({ id: o.id, status: "CANCELLED" })}
                                >
                                  {t("operations.markCancelled", "Cancel")}
                                </Button>
                              </div>
                            ) : o.status === "COMPLETED" && canAdminEditCompleted ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={statusMut.isPending || editMut.isPending}
                                onClick={() => openEdit(o)}
                              >
                                {t("operations.edit", "Edit")}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </ResponsiveTable>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={opTotal}
                totalPages={opTotalPages}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
