import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { usePatientsQuery, useSchedulingPhysiciansQuery } from "@/lib/api-hooks";
import { apiGet, apiPost } from "@/lib/http";
import { patientToPickListItem } from "@/lib/patient-display";
import { physicianToPickListItem } from "@/lib/physician-display";
import { useDebouncedPickListSearch } from "@/lib/pick-list-utils";

type NameFields = { firstNameEn: string; lastNameEn: string; firstNameAr?: string | null; lastNameAr?: string | null };

export type WaitlistEntryRow = {
  id: string;
  status: "WAITING" | "OFFERED";
  createdAt: string;
  notes: string | null;
  patient: NameFields & { mrn: string };
  clinician: { displayName: string } | null;
};

export type WaitlistOfferStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN" | "SKIPPED";

export type WaitlistSlotRow = {
  id: string;
  startsAt: string;
  status: "OPEN" | "FILLED" | "FILLED_ELSEWHERE" | "EXHAUSTED" | "CLOSED";
  offers: {
    id: string;
    status: WaitlistOfferStatus;
    offeredAt: string;
    expiresAt: string;
    waitlistEntry: { patient: NameFields & { mrn: string } };
  }[];
};

function waitlistPatientName(p: NameFields, language: string): string {
  const ar = [p.firstNameAr, p.lastNameAr].filter(Boolean).join(" ").trim();
  if (language.startsWith("ar") && ar) return ar;
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

const OFFER_BADGE: Record<WaitlistOfferStatus, "default" | "secondary" | "outline" | "muted"> = {
  PENDING: "default",
  ACCEPTED: "secondary",
  DECLINED: "outline",
  EXPIRED: "outline",
  WITHDRAWN: "outline",
  SKIPPED: "muted",
};

type Props = { clinicId?: string };

export function WaitlistPanel({ clinicId }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [patientItem, setPatientItem] = useState<PickListItem | null>(null);
  const [clinicianId, setClinicianId] = useState("");
  const [clinicianItem, setClinicianItem] = useState<PickListItem | null>(null);
  const patientSearch = useDebouncedPickListSearch();
  const doctorSearch = useDebouncedPickListSearch();
  const qs = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : "";

  const entriesQ = useQuery({
    queryKey: ["waitlist", "entries", clinicId ?? ""],
    queryFn: () => apiGet<WaitlistEntryRow[]>(`/api/v1/scheduling/waitlist${qs}`),
    enabled: Boolean(clinicId),
    refetchInterval: 30_000,
  });
  const offersQ = useQuery({
    queryKey: ["waitlist", "offers", clinicId ?? ""],
    queryFn: () => apiGet<WaitlistSlotRow[]>(`/api/v1/scheduling/waitlist/offers${qs}`),
    enabled: Boolean(clinicId),
    refetchInterval: 15_000,
  });

  const { data: patData, isPending: patientsPending } = usePatientsQuery({
    search: patientSearch.debounced.trim() || undefined,
    page: 1,
    pageSize: 50,
    enabled: Boolean(clinicId),
  });
  const patientItems = useMemo(() => (patData?.items ?? []).map((p) => patientToPickListItem(p)), [patData]);
  const { data: physicians = [] } = useSchedulingPhysiciansQuery({
    clinicId,
    search: doctorSearch.debounced.trim() || undefined,
    enabled: Boolean(clinicId),
  });
  const doctorItems = useMemo(
    () => physicians.map((d) => physicianToPickListItem(d, i18n.language)),
    [physicians, i18n.language],
  );

  const add = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/scheduling/waitlist", { clinicId, patientId, clinicianId: clinicianId || undefined }),
    onSuccess: () => {
      setPatientId("");
      setPatientItem(null);
      void qc.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(t("waitlist.added", "Added to the waitlist"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/scheduling/waitlist/${encodeURIComponent(id)}/cancel`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["waitlist"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const timeFmt = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const entries = entriesQ.data ?? [];
  const slots = offersQ.data ?? [];

  return (
    <Card data-testid="waitlist-panel">
      <CardHeader>
        <CardTitle className="text-base">{t("waitlist.title", "Waitlist")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "waitlist.hint",
            "When an appointment is cancelled, the freed time is offered on WhatsApp to waiting patients one at a time, in order. Each offer is held for a few minutes; the first to accept is booked.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <SearchablePickList
            items={patientItems}
            value={patientId}
            selectedItem={patientItem}
            onValueChange={(id, item) => {
              setPatientId(id);
              setPatientItem(item ?? patientItems.find((p) => p.value === id) ?? null);
            }}
            onSearchQueryChange={patientSearch.setSearch}
            onOpen={patientSearch.handleOpen}
            searchPlaceholder={t("encounters.patientSearchPlaceholder")}
            placeholder={t("waitlist.pickPatient", "Patient to add")}
            emptyMessage={patientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")}
            localFilter={false}
            minSearchLength={1}
            idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
          />
          <SearchablePickList
            items={[{ value: "", label: t("waitlist.anyDoctor", "Any doctor") }, ...doctorItems]}
            value={clinicianId}
            selectedItem={clinicianItem}
            onValueChange={(id, item) => {
              setClinicianId(id);
              setClinicianItem(item ?? null);
            }}
            onSearchQueryChange={doctorSearch.setSearch}
            onOpen={doctorSearch.handleOpen}
            placeholder={t("waitlist.anyDoctor", "Any doctor")}
            localFilter={false}
          />
          <Button
            type="button"
            className="min-h-10"
            data-testid="waitlist-add"
            disabled={!patientId || !clinicId || add.isPending}
            onClick={() => add.mutate()}
          >
            {t("waitlist.add", "Add to waitlist")}
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("waitlist.waiting", "Waiting patients")}</h3>
          {entries.length === 0 && !entriesQ.isPending ? (
            <p className="text-sm text-muted-foreground">{t("waitlist.empty", "Nobody is on the waitlist.")}</p>
          ) : null}
          <ol className="space-y-2" data-testid="waitlist-entries">
            {entries.map((e, i) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" data-testid="waitlist-entry" data-entry-id={e.id}>
                <div className="min-w-0">
                  <span className="me-2 font-mono text-muted-foreground ltr-nums">{i + 1}.</span>
                  <span className="font-medium">{waitlistPatientName(e.patient, i18n.language)}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {e.clinician?.displayName ?? t("waitlist.anyDoctor", "Any doctor")}
                  </span>
                  {e.status === "OFFERED" ? (
                    <Badge className="ms-2 text-xs">{t("waitlist.offerOut", "Offer sent")}</Badge>
                  ) : null}
                </div>
                <Button type="button" size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}>
                  {t("waitlist.remove", "Remove")}
                </Button>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("waitlist.offersTitle", "Freed slots & offers sent")}</h3>
          {slots.length === 0 && !offersQ.isPending ? (
            <p className="text-sm text-muted-foreground">{t("waitlist.noOffers", "No cancelled slots to fill in the last 7 days.")}</p>
          ) : null}
          <ul className="space-y-2" data-testid="waitlist-offers">
            {slots.map((s) => (
              <li key={s.id} className="space-y-1 rounded-md border px-3 py-2 text-sm" data-testid="waitlist-slot" data-starts-at={s.startsAt}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium ltr-nums">{timeFmt(s.startsAt)}</span>
                  <Badge variant={s.status === "FILLED" ? "secondary" : "outline"} data-testid="waitlist-slot-status">
                    {t(`waitlist.slotStatus.${s.status}`, s.status)}
                  </Badge>
                </div>
                {s.offers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("waitlist.noOfferYet", "No offer sent yet.")}</p>
                ) : (
                  <ul className="space-y-1">
                    {s.offers.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span>
                          {waitlistPatientName(o.waitlistEntry.patient, i18n.language)}
                          <span className="text-muted-foreground ltr-nums">
                            {" · "}
                            {o.status === "PENDING"
                              ? t("waitlist.holdUntil", "held until {{time}}", {
                                  time: new Date(o.expiresAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
                                })
                              : timeFmt(o.offeredAt)}
                          </span>
                        </span>
                        <Badge variant={OFFER_BADGE[o.status]} className="text-xs" data-testid="waitlist-offer-status">
                          {t(`waitlist.offerStatus.${o.status}`, o.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
