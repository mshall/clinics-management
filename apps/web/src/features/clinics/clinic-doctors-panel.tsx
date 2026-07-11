import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAvailableClinicPhysiciansQuery, useClinicPhysiciansQuery } from "@/lib/api-hooks";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectClinicDoctorAssignIssues } from "@/lib/create-form-validation";
import { resolvePickListSelectedItem } from "@/lib/pick-list-utils";
import { physicianToPickListItem } from "@/lib/physician-display";
import { apiDelete, apiPost } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

const MANAGE_ROLES = new Set(["group_admin", "branch_manager", "clinic_admin"]);

export function ClinicDoctorsPanel({ clinicId }: { clinicId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role ? MANAGE_ROLES.has(role) : false;

  const { data: assigned = [], isPending } = useClinicPhysiciansQuery(clinicId);
  const [addOpen, setAddOpen] = useState(false);
  const [pickUserId, setPickUserId] = useState("");
  const [pinnedPhysicianItem, setPinnedPhysicianItem] = useState<PickListItem | null>(null);
  const [addSearch, setAddSearch] = useState("");
  const [debouncedAddSearch, setDebouncedAddSearch] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedAddSearch(addSearch), 280);
    return () => window.clearTimeout(tid);
  }, [addSearch]);

  const { data: available = [], isPending: availPending } = useAvailableClinicPhysiciansQuery(
    clinicId,
    debouncedAddSearch.trim() || undefined,
    addOpen && canManage
  );

  const availableItems: PickListItem[] = useMemo(
    () => available.map((d) => physicianToPickListItem(d, i18n.language)),
    [available, i18n.language],
  );

  const assignPhysicianSelectedItem = useMemo(
    (): PickListItem | null =>
      resolvePickListSelectedItem(pickUserId, availableItems, pinnedPhysicianItem),
    [pickUserId, availableItems, pinnedPhysicianItem],
  );

  const addMut = useMutation({
    mutationFn: (userId: string) => apiPost<unknown>(`/api/v1/clinics/${clinicId}/physicians`, { userId }),
    onSuccess: () => {
      setPickUserId("");
      setPinnedPhysicianItem(null);
      setAddSearch("");
      setDebouncedAddSearch("");
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId, "physicians"] });
      void qc.invalidateQueries({ queryKey: ["clinicians", "scheduling"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => apiDelete<unknown>(`/api/v1/clinics/${clinicId}/physicians/${userId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId, "physicians"] });
      void qc.invalidateQueries({ queryKey: ["clinicians", "scheduling"] });
    },
  });

  const validation = useValidationIssuesDialog({ intent: "create" });

  const handleAssign = () => {
    if (addMut.isPending) return;
    const issues = collectClinicDoctorAssignIssues({ userId: pickUserId }, t);
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    addMut.mutate(pickUserId, {
      onError: (e: unknown) => validation.showError(e),
    });
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{t("clinics.assignDoctor", "Assign a doctor")}</CardTitle>
              <CardDescription>
                {t("clinics.assignDoctorHint", "Add a physician from your organization to this clinic.")}
              </CardDescription>
            </div>
            <CreateActionButton type="button" onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? t("common.hide", "Hide") : t("clinics.addDoctor", "Add doctor")}
            </CreateActionButton>
          </CardHeader>
          {addOpen ? (
            <CardContent className="space-y-3 overflow-visible">
              <SearchablePickList
                items={availableItems}
                value={pickUserId}
                selectedItem={assignPhysicianSelectedItem}
                onValueChange={(id) => {
                  setPickUserId(id);
                  const item = availableItems.find((d) => d.value === id);
                  if (item) setPinnedPhysicianItem(item);
                }}
                onSearchQueryChange={setAddSearch}
                onOpen={() => setDebouncedAddSearch("")}
                searchPlaceholder={t("appointments.filterPhysician", "Type physician name, Arabic name, or email…")}
                placeholder={t("clinics.pickDoctor", "Select physician")}
                emptyMessage={
                  availPending ? t("common.loading") : t("clinics.noDoctorsAvailable", "No available physicians.")
                }
                localFilter={false}
                minSearchLength={0}
                idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
              />
              {validation.formErr ? <p className="text-sm text-destructive">{validation.formErr}</p> : null}
              <CreateActionButton
                type="button"
                disabled={addMut.isPending}
                onClick={handleAssign}
              >
                {t("clinics.assignDoctorAction", "Assign to clinic")}
              </CreateActionButton>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("clinics.assignedDoctors", "Doctors assigned")}</CardTitle>
          <CardDescription>
            {t("clinics.assignedDoctorsHint", "Physicians linked to this clinic for scheduling and operations.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : assigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clinics.noAssignedDoctors", "No doctors assigned yet.")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("clinics.doctorName", "Name")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("clinics.email", "Email")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("hr.jobTitle", "Job title")}</th>
                    {canManage ? <th className="px-3 py-2 text-end font-medium">{t("common.actions", "Actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((d) => (
                    <tr key={d.userId} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {physicianToPickListItem(d, i18n.language).label}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{d.email ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.jobTitle ?? "—"}</td>
                      {canManage ? (
                        <td className="px-3 py-2 text-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={removeMut.isPending}
                            onClick={() => removeMut.mutate(d.userId)}
                          >
                            {t("common.remove", "Remove")}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </div>
  );
}
