import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KiorexHomeCard } from "@/features/kiorex/kiorex-home-card";
import { NurseSetupCard } from "./nurse-setup-card";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { AvailabilityEditor, ZonesEditor } from "./availability-zones";
import { EmptyBlock, ErrorBlock, Field, GateNotice, LoadingBlock, PageShell, PatientPicker, selectClass, StatusPill, type PatientLite, type RosterItem } from "./nurse-shared";
import { currentPosition, errorCode, fmtDateTime, isGateError, money, todayIso, useErrorText, useNurseContext } from "./nurse-shared-utils";

type HomeVisitRow = { id: string; state: string; plannedStartsAt: string; plannedEndsAt: string; district: string; clinicianId: string | null; patient: { name?: string; id: string }; source: "KIOREX" | "KIORLY" };
type Suggestion = { clinicianId: string; score: number; reasons: string[] };
type Shift = { id: string; patientId: string; nurseId: string; patientName: string | null; nurseName: string | null; startsAt: string; endsAt: string; durationHours: number; status: "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; checkInAt: string | null; checkOutAt: string | null; handoverNote: string | null };
type Pay = { visits: number; shiftHours: number; visitPay: string; shiftPay: string; totalPay: string; cashOwedToAgency: string; payRatesConfigured: boolean };

/** KNAG01-04 — agency dispatch: assign / reassign nurses (the dispatch guard is visible), roster with pay rates, private-duty shifts and availability. */
export function DispatchPage() {
  const { t } = useTranslation();
  return (
    <PageShell title={t("nurse.dispatch.title")} subtitle={t("nurse.dispatch.subtitle")} testId="nurse-dispatch">
      <NurseSetupCard />
      <KiorexHomeCard />
      <Tabs defaultValue="visits">
        <TabsList className="h-auto w-full flex-wrap">
          <TabsTrigger value="visits" className="min-h-11">{t("nurse.dispatch.visits")}</TabsTrigger>
          <TabsTrigger value="roster" className="min-h-11">{t("nurse.dispatch.roster")}</TabsTrigger>
          <TabsTrigger value="shifts" className="min-h-11">{t("nurse.dispatch.shifts")}</TabsTrigger>
        </TabsList>
        <TabsContent value="visits" className="space-y-3"><VisitsTab /></TabsContent>
        <TabsContent value="roster" className="space-y-3"><RosterTab /></TabsContent>
        <TabsContent value="shifts" className="space-y-3"><ShiftsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function useRoster() {
  return useQuery({ queryKey: ["nurse", "roster"], queryFn: () => apiGet<{ items: RosterItem[] }>("/api/v1/nurse/agency/roster"), retry: false });
}

function VisitsTab() {
  const { t } = useTranslation();
  const ctx = useNurseContext();
  const roster = useRoster();
  const [only, setOnly] = useState<"unassigned" | "all">("all");
  const [target, setTarget] = useState<HomeVisitRow | null>(null);
  const to = todayIso(14);
  const visits = useQuery({ queryKey: ["nurse", "dispatch", "visits"], queryFn: () => apiGet<{ items: HomeVisitRow[] }>(`/api/v1/home-visits?from=${todayIso()}&to=${to}`), refetchInterval: 30_000 });
  const names = new Map(roster.data?.items.map((r) => [r.userId, r.name]));
  const rows = (visits.data?.items ?? []).filter((v) => (v.state === "REQUESTED" || v.state === "CONFIRMED") && (only === "all" || !v.clinicianId || v.state === "REQUESTED"));
  const dispatchOff = ctx.data ? ctx.data.features["clinic.home_dispatch"] === false : false;
  return (
    <>
      {dispatchOff ? <GateNotice feature="clinic.home_dispatch" /> : null}
      <div className="flex gap-2" role="group" aria-label={t("nurse.common.status")}>
        {(["all", "unassigned"] as const).map((k) => <Button key={k} size="sm" className="min-h-11" variant={only === k ? "default" : "outline"} aria-pressed={only === k} onClick={() => setOnly(k)}>{t(`nurse.dispatch.filter.${k}`)}</Button>)}
      </div>
      {visits.isLoading ? <LoadingBlock /> : null}
      {visits.isError ? <ErrorBlock error={visits.error} onRetry={() => void visits.refetch()} /> : null}
      {visits.data && rows.length === 0 ? <EmptyBlock message={t("nurse.dispatch.noVisits")} /> : null}
      <ul className="space-y-2">
        {rows.map((v) => (
          <li key={v.id}>
            <Card data-testid="dispatch-visit">
              <CardContent className="space-y-3 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground tabular-nums">{fmtDateTime(v.plannedStartsAt)}</p>
                    <p className="truncate text-base font-semibold">{v.patient.name ?? v.district}</p>
                    <p className="text-muted-foreground">{v.district}{v.source === "KIOREX" ? ` · Kiorex` : ""}</p>
                  </div>
                  <StatusPill tone={v.clinicianId ? "ok" : "warn"}>{v.clinicianId ? t("nurse.dispatch.assignedTo", { name: names.get(v.clinicianId) ?? "-" }) : t("nurse.dispatch.unassigned")}</StatusPill>
                </div>
                <Button size="lg" variant={v.clinicianId ? "outline" : "default"} className="min-h-12 w-full" onClick={() => setTarget(v)} data-testid="dispatch-assign">{v.clinicianId ? t("nurse.dispatch.reassign") : t("nurse.dispatch.assign")}</Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {target ? <AssignDialog visit={target} roster={roster.data?.items ?? []} onClose={() => setTarget(null)} /> : null}
    </>
  );
}

function AssignDialog({ visit, roster, onClose }: { visit: HomeVisitRow; roster: RosterItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nurseId, setNurseId] = useState("");
  const sugg = useQuery({ queryKey: ["nurse", "dispatch", "suggest", visit.id], queryFn: () => apiGet<{ suggestions: Suggestion[] }>(`/api/v1/home-visits/${visit.id}/suggestions`), retry: false });
  const assign = useMutation({
    mutationFn: () => apiPost(`/api/v1/home-visits/${visit.id}/assign`, { clinicianId: nurseId }),
    onSuccess: () => { toast.success(t("nurse.dispatch.assigned")); void qc.invalidateQueries({ queryKey: ["nurse", "dispatch"] }); void qc.invalidateQueries({ queryKey: ["nurse", "inbox"] }); onClose(); },
  });
  const ok = roster.filter((r) => r.dispatchable);
  const blocked = roster.filter((r) => !r.dispatchable);
  const nameOf = (id: string) => roster.find((r) => r.userId === id)?.name ?? id;
  const code = errorCode(assign.error);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="assign-dialog">
        <DialogHeader><DialogTitle>{visit.clinicianId ? t("nurse.dispatch.reassign") : t("nurse.dispatch.assign")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{fmtDateTime(visit.plannedStartsAt)} · {visit.district}</p>
        {sugg.data?.suggestions.length ? (
          <div className="space-y-1" data-testid="assign-suggestions">
            <p className="text-sm font-medium">{t("nurse.dispatch.suggested")}</p>
            <div className="flex flex-wrap gap-2">
              {sugg.data.suggestions.map((s) => <Button key={s.clinicianId} size="sm" variant={nurseId === s.clinicianId ? "default" : "outline"} className="min-h-11" onClick={() => setNurseId(s.clinicianId)}>{nameOf(s.clinicianId)} · {s.reasons.map((r) => t(`nurse.dispatch.reasons.${r}`, r)).join(", ")}</Button>)}
            </div>
          </div>
        ) : null}
        <Field label={t("nurse.common.nurse")} htmlFor="assign-nurse">
          <select id="assign-nurse" className={selectClass} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
            <option value="">{t("nurse.common.choose")}</option>
            {ok.map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
          </select>
        </Field>
        {blocked.length ? (
          <div className="kx-callout flex-col gap-1 text-sm" data-tone="warn" data-testid="assign-blocked">
            <p className="font-semibold">{t("nurse.dispatch.notDispatchable")}</p>
            <ul className="list-disc ps-5 text-muted-foreground">{blocked.map((r) => <li key={r.userId}>{r.name}: {t(`nurse.dispatch.blockReason.${r.notDispatchableReason}`, r.notDispatchableReason ?? "")}</li>)}</ul>
          </div>
        ) : null}
        {assign.isError ? (isGateError(assign.error) ? <GateNotice feature="clinic.home_dispatch" /> : <div role="alert" data-testid="assign-error" data-code={code ?? ""}><ErrorBlock error={assign.error} /></div>) : null}
        <DialogFooter>
          <Button variant="outline" className="min-h-12" onClick={onClose}>{t("nurse.common.cancel")}</Button>
          <Button className="min-h-12" disabled={!nurseId || assign.isPending} onClick={() => assign.mutate()} data-testid="assign-confirm">{t("nurse.dispatch.confirmAssign")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RosterTab() {
  const { t } = useTranslation();
  const roster = useRoster();
  const [editing, setEditing] = useState<RosterItem | null>(null);
  return (
    <>
      {roster.isLoading ? <LoadingBlock /> : null}
      {roster.isError ? <ErrorBlock error={roster.error} onRetry={() => void roster.refetch()} /> : null}
      {roster.data && roster.data.items.length === 0 ? <EmptyBlock message={t("nurse.dispatch.noRoster")} /> : null}
      <ul className="space-y-2">
        {roster.data?.items.map((r) => (
          <li key={r.userId}>
            <Card data-testid="roster-row" data-kind={r.kind} data-dispatchable={String(r.dispatchable)}>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-3 text-base font-semibold"><span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{r.name.charAt(0).toUpperCase()}</span><span>{r.name}<span className="block text-xs font-normal text-muted-foreground">{t(`nurse.dispatch.kind.${r.kind}`)}</span></span></p>
                  {r.dispatchable ? <StatusPill tone="ok">{t("nurse.dispatch.dispatchable")}</StatusPill> : <StatusPill tone="bad">{t(`nurse.dispatch.blockReason.${r.notDispatchableReason}`, r.notDispatchableReason ?? "")}</StatusPill>}
                </div>
                <p className="text-muted-foreground">{[...r.skills, ...r.languages].join(" · ") || "-"}{r.zones.length ? ` · ${r.zones.join(", ")}` : ""}</p>
                {r.kind === "NURSE" ? <Button variant="outline" className="min-h-12 w-full sm:w-auto" onClick={() => setEditing(r)}>{t("nurse.dispatch.manage")}</Button> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {editing ? <RosterDialog nurse={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function RosterDialog({ nurse, onClose }: { nurse: RosterItem; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const [skills, setSkills] = useState(nurse.skills.join(", "));
  const [languages, setLanguages] = useState(nurse.languages.join(", "));
  const [perVisit, setPerVisit] = useState("");
  const [perHour, setPerHour] = useState("");
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => apiPut(`/api/v1/nurse/agency/roster/${nurse.userId}`, { skills: csv(skills), languages: csv(languages), payPerVisit: perVisit ? Number(perVisit) : null, payPerShiftHour: perHour ? Number(perHour) : null }),
    onSuccess: () => { toast.success(t("nurse.dispatch.rosterSaved")); void qc.invalidateQueries({ queryKey: ["nurse", "roster"] }); },
    onError: (e) => toast.error(errText(e)),
  });
  const [from] = useState(() => todayIso(-30));
  const to = todayIso(1);
  const pay = useQuery({ queryKey: ["nurse", "pay", nurse.userId, from, to], queryFn: () => apiGet<Pay>(`/api/v1/nurse/agency/pay/${nurse.userId}?from=${from}&to=${to}`), retry: false });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="roster-dialog">
        <DialogHeader><DialogTitle>{nurse.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("nurse.dispatch.skills")} htmlFor="r-skills"><Input id="r-skills" className="min-h-11" value={skills} onChange={(e) => setSkills(e.target.value)} /></Field>
          <Field label={t("nurse.dispatch.languages")} htmlFor="r-lang"><Input id="r-lang" className="min-h-11" value={languages} onChange={(e) => setLanguages(e.target.value)} /></Field>
          <Field label={t("nurse.dispatch.payPerVisit")} htmlFor="r-pv"><Input id="r-pv" type="number" min={0} className="min-h-11" value={perVisit} onChange={(e) => setPerVisit(e.target.value)} /></Field>
          <Field label={t("nurse.dispatch.payPerHour")} htmlFor="r-ph"><Input id="r-ph" type="number" min={0} className="min-h-11" value={perHour} onChange={(e) => setPerHour(e.target.value)} /></Field>
        </div>
        <Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()}>{t("nurse.common.save")}</Button>
        {pay.data ? (
          <div className="kx-callout flex-col gap-1 text-sm" data-tone="info" data-testid="pay-statement">
            <p className="font-medium">{t("nurse.dispatch.payStatement")}</p>
            <p>{t("nurse.dispatch.payLine", { visits: pay.data.visits, hours: pay.data.shiftHours, total: money(pay.data.totalPay) })}</p>
            <p className="text-muted-foreground">{t("nurse.dispatch.cashOwed", { amount: money(pay.data.cashOwedToAgency) })}</p>
            {!pay.data.payRatesConfigured ? <p className="text-[hsl(var(--warning))] ">{t("nurse.dispatch.noRates")}</p> : null}
          </div>
        ) : null}
        <ZonesEditor clinicianId={nurse.userId} title={t("nurse.dispatch.zonesFor", { name: nurse.name })} />
        <AvailabilityEditor clinicianId={nurse.userId} title={t("nurse.dispatch.availabilityFor", { name: nurse.name })} />
      </DialogContent>
    </Dialog>
  );
}

function ShiftsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const me = useAuthStore((s) => s.user);
  const ctx = useNurseContext();
  const agency = ctx.data?.kind === "AGENCY";
  const gateOff = ctx.data ? ctx.data.features["nurse.private_duty_shifts"] === false : false;
  const roster = useRoster();
  const shifts = useQuery({ queryKey: ["nurse", "shifts"], queryFn: () => apiGet<{ items: Shift[] }>("/api/v1/nurse/shifts") });
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState<Shift | null>(null);
  const checkIn = useMutation({
    mutationFn: async (id: string) => apiPost(`/api/v1/nurse/shifts/${id}/check-in`, await currentPosition()),
    onSuccess: () => { toast.success(t("nurse.shifts.checkedIn")); void qc.invalidateQueries({ queryKey: ["nurse", "shifts"] }); },
    onError: (e) => toast.error(e instanceof Error && !("status" in e) ? t("homeVisits.needLocation") : errText(e)),
  });
  return (
    <>
      {gateOff ? <GateNotice feature="nurse.private_duty_shifts" /> : null}
      <Button className="min-h-11" disabled={gateOff} onClick={() => setOpen(true)} data-testid="shift-new">{t("nurse.shifts.new")}</Button>
      {shifts.isLoading ? <LoadingBlock /> : null}
      {shifts.isError ? <ErrorBlock error={shifts.error} onRetry={() => void shifts.refetch()} /> : null}
      {shifts.data && shifts.data.items.length === 0 ? <EmptyBlock message={t("nurse.shifts.empty")} /> : null}
      <ul className="space-y-2">
        {shifts.data?.items.map((s) => (
          <li key={s.id}>
            <Card data-testid="shift-row">
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{fmtDateTime(s.startsAt)} · {t("nurse.shifts.hours", { count: s.durationHours })}</p>
                  <StatusPill tone={s.status === "IN_PROGRESS" ? "ok" : s.status === "COMPLETED" ? "muted" : "warn"}>{t(`nurse.shifts.status.${s.status}`)}</StatusPill>
                </div>
                <p className="text-muted-foreground">{s.patientName ?? s.patientId} · {s.nurseName ?? s.nurseId}</p>
                {s.handoverNote ? <p className="whitespace-pre-wrap">{s.handoverNote}</p> : null}
                {s.nurseId === me?.id && s.status === "BOOKED" ? <Button size="sm" className="min-h-11" disabled={checkIn.isPending} onClick={() => checkIn.mutate(s.id)}>{t("nurse.shifts.checkIn")}</Button> : null}
                {s.nurseId === me?.id && s.status === "IN_PROGRESS" ? <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOut(s)}>{t("nurse.shifts.checkOut")}</Button> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {open ? <BookShiftDialog agency={agency} roster={roster.data?.items ?? []} onClose={() => setOpen(false)} /> : null}
      {out ? <CheckOutDialog shift={out} roster={roster.data?.items ?? []} onClose={() => setOut(null)} /> : null}
    </>
  );
}

function BookShiftDialog({ agency, roster, onClose }: { agency: boolean; roster: RosterItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [nurseId, setNurseId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [hours, setHours] = useState(8);
  const effective = agency ? nurseId : me?.id ?? "";
  const valid = Boolean(patient && effective && startsAt);
  const book = useMutation({
    mutationFn: () => apiPost(`/api/v1/nurse/shifts`, { patientId: patient!.id, nurseId: effective, startsAt: new Date(startsAt).toISOString(), durationHours: hours }),
    onSuccess: () => { toast.success(t("nurse.shifts.booked")); void qc.invalidateQueries({ queryKey: ["nurse", "shifts"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="shift-dialog">
        <DialogHeader><DialogTitle>{t("nurse.shifts.new")}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) book.mutate(); }}>
          <PatientPicker value={patient} onChange={setPatient} />
          {agency ? (
            <Field label={t("nurse.common.nurse")} htmlFor="sh-nurse">
              <select id="sh-nurse" className={selectClass} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
                <option value="">{t("nurse.common.choose")}</option>
                {roster.filter((r) => r.dispatchable).map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("nurse.shifts.starts")} htmlFor="sh-start"><Input id="sh-start" type="datetime-local" className="min-h-11" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
            <Field label={t("nurse.shifts.duration")} htmlFor="sh-hours">
              <select id="sh-hours" className={selectClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[8, 12, 24].map((h) => <option key={h} value={h}>{t("nurse.shifts.hours", { count: h })}</option>)}</select>
            </Field>
          </div>
          {book.isError ? (isGateError(book.error) ? <GateNotice feature="nurse.private_duty_shifts" /> : <ErrorBlock error={book.error} />) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={!valid || book.isPending}>{t("nurse.shifts.book")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckOutDialog({ shift, roster, onClose }: { shift: Shift; roster: RosterItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const out = useMutation({
    mutationFn: async () => apiPost(`/api/v1/nurse/shifts/${shift.id}/check-out`, { ...(await currentPosition()), handoverNote: note.trim() || undefined, handoverToNurseId: next || undefined }),
    onSuccess: () => { toast.success(t("nurse.shifts.checkedOut")); void qc.invalidateQueries({ queryKey: ["nurse", "shifts"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("nurse.shifts.checkOut")}</DialogTitle></DialogHeader>
        <Field label={t("nurse.shifts.handover")} htmlFor="sh-note" hint={t("nurse.shifts.handoverHint")}><Input id="sh-note" className="min-h-11" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {roster.length ? (
          <Field label={t("nurse.shifts.handoverTo")} htmlFor="sh-next">
            <select id="sh-next" className={selectClass} value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">{t("nurse.common.choose")}</option>
              {roster.filter((r) => r.dispatchable && r.userId !== me?.id).map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
            </select>
          </Field>
        ) : null}
        {out.isError ? <ErrorBlock error={out.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="min-h-11" onClick={onClose}>{t("nurse.common.cancel")}</Button>
          <Button className="min-h-11" disabled={out.isPending} onClick={() => out.mutate()}>{t("nurse.shifts.checkOut")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Solo and agency nurses: private-duty shifts on their own page (8/12/24 h, geostamped check-in/out, handover note). */
export function ShiftsPage() {
  const { t } = useTranslation();
  return (
    <PageShell title={t("nurse.shifts.title")} subtitle={t("nurse.shifts.subtitle")} testId="nurse-shifts">
      <ShiftsTab />
    </PageShell>
  );
}
