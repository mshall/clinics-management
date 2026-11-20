import { EmptyState, PageHeader, StatusChip } from "@/brand/ui-kit";
import { PulseLine } from "@/brand/components";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { useDeferredValue, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet } from "@/lib/http";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

/** Kiorly Nurse web (KNED..KNRPT). Shared pieces: context, error/empty/loading/awaiting-gate states, patient picker, small form helpers. */
export type NurseContext = {
  edition: "CLINIC" | "NURSE";
  kind: "SOLO" | "AGENCY" | null;
  features: Record<string, boolean>;
  defaultSignIn?: string;
};

/** Same query key as EditionBoot so the context is fetched once per session. */
export function useNurseContext() {
  const hasToken = useAuthStore((s) => Boolean(s.accessToken));
  return useQuery({ queryKey: ["nurse", "context"], queryFn: () => apiGet<NurseContext>("/api/v1/nurse/context"), enabled: hasToken, staleTime: 5 * 60_000, retry: false });
}

export function useIsAgency(): boolean {
  return useNurseContext().data?.kind === "AGENCY";
}

export function errorCode(e: unknown): string | null {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const c = (e.body as { code?: unknown }).code;
    return typeof c === "string" ? c : null;
  }
  return null;
}

export function errorBody<T = Record<string, unknown>>(e: unknown): T | null {
  return e instanceof ApiError && e.body && typeof e.body === "object" ? (e.body as T) : null;
}

export function isGateError(e: unknown): boolean {
  return errorCode(e) === "FEATURE_DISABLED";
}

/** Localised message for an API error: a `nurse.errors.<CODE>` string when we have one, else the server message. */
export function useErrorText() {
  const { t, i18n } = useTranslation();
  return (e: unknown): string => {
    const code = errorCode(e);
    if (code && i18n.exists(`nurse.errors.${code}`)) return t(`nurse.errors.${code}`);
    if (e instanceof Error && e.message) return e.message;
    return t("nurse.errors.generic");
  };
}

export function PageShell({ title, subtitle, actions, children, testId }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24 md:pb-6" data-testid={testId}>
      <PageHeader title={title} description={subtitle} actions={actions} />
      {children}
    </div>
  );
}

export function LoadingBlock() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground" role="status" data-testid="nurse-loading">
      <PulseLine size={14} loop label="" /> <span>{t("nurse.common.loading")}</span>
    </div>
  );
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <div data-testid="nurse-empty">
      <EmptyState compact title={message} />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const text = useErrorText();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--danger-text)/0.35)] bg-[hsl(var(--danger-text)/0.07)] p-4 text-sm" role="alert" data-testid="nurse-error">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[hsl(var(--danger-text))]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p>{text(error)}</p>
        {onRetry ? (
          <button type="button" className="mt-1 min-h-11 font-medium text-primary underline-offset-4 hover:underline" onClick={onRetry}>
            {t("nurse.common.retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Flag OFF / launch gate not satisfied. Safety paths are never shown behind this (SOS, unsafe-abort, MAR safety checks are not flags). */
export function GateNotice({ feature, compact }: { feature: string; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-500/10 text-sm", compact ? "p-2" : "p-3")} role="status" data-testid="nurse-gate-notice" data-feature={feature}>
      <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div>
        <p className="font-medium">{t("nurse.gate.title")}</p>
        <p className="text-muted-foreground">{t(`nurse.gate.${feature.replace(/\./g, "_")}`, t("nurse.gate.generic"))}</p>
      </div>
    </div>
  );
}

export type PatientLite = { id: string; mrn?: string; firstNameEn: string; lastNameEn: string; phone?: string };

export function patientName(p: { firstNameEn: string; lastNameEn: string }): string {
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

/** Type-ahead patient picker (name / phone / MRN search against the existing patients API). */
export function PatientPicker({ value, onChange, label, id = "nurse-patient" }: { value: PatientLite | null; onChange: (p: PatientLite | null) => void; label?: string; id?: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const list = useQuery({
    queryKey: ["nurse", "patient-search", deferred],
    queryFn: () => apiGet<{ items: PatientLite[] }>(`/api/v1/patients?pageSize=8&search=${encodeURIComponent(deferred)}`),
    enabled: !value,
    staleTime: 10_000,
  });
  if (value) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{label ?? t("nurse.common.patient")}</Label>
        <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm" data-testid="nurse-patient-selected">
          <span className="min-w-0 truncate">{patientName(value)}{value.mrn ? ` · ${value.mrn}` : ""}</span>
          <button type="button" className="min-h-11 shrink-0 px-2 text-primary underline" onClick={() => onChange(null)}>
            {t("nurse.common.change")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label ?? t("nurse.common.patient")}</Label>
      <Input id={id} className="min-h-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("nurse.common.searchPatient")} autoComplete="off" />
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock error={list.error} /> : null}
      {list.data ? (
        list.data.items.length ? (
          <ul className="max-h-56 divide-y overflow-auto rounded-md border" role="listbox" aria-label={t("nurse.common.patient")}>
            {list.data.items.map((p) => (
              <li key={p.id}>
                <button type="button" role="option" aria-selected={false} className="min-h-11 w-full px-3 py-2 text-start text-sm hover:bg-muted" data-testid="nurse-patient-option" onClick={() => onChange(p)}>
                  {patientName(p)} <span className="text-muted-foreground">{p.mrn ?? ""} {p.phone ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nurse.common.noPatients")}</p>
        )
      ) : null}
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type AppointmentTypeRow = { id: string; nameEn: string; nameAr: string; durationMinutes: number; feeAmount: string | number; serviceLocation: "IN_CLINIC" | "HOME"; homeSurchargeAmount?: string | number | null; clinicId?: string | null; isActive: boolean; bufferBeforeMin?: number; bufferAfterMin?: number };

export function useHomeServices() {
  return useQuery({
    queryKey: ["nurse", "services"],
    queryFn: async () => {
      const rows = await apiGet<AppointmentTypeRow[] | { items: AppointmentTypeRow[] }>("/api/v1/scheduling/appointment-types");
      const list = Array.isArray(rows) ? rows : rows.items;
      return list.filter((r) => r.serviceLocation === "HOME" && r.isActive);
    },
  });
}

export function useClinics() {
  return useQuery({ queryKey: ["nurse", "clinics"], queryFn: () => apiGet<{ id: string; nameEn: string }[]>("/api/v1/clinics"), staleTime: 5 * 60_000 });
}

export type RosterItem = { userId: string; name: string; kind: "NURSE" | "AIDE"; skills: string[]; languages: string[]; zones: string[]; dispatchable: boolean; notDispatchableReason: string | null };

export function useServiceName() {
  const { i18n } = useTranslation();
  return (s: { nameEn: string; nameAr: string }) => (i18n.language.startsWith("ar") && s.nameAr ? s.nameAr : s.nameEn);
}

export function money(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "0";
}

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";
}

export function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "-";
}

export function todayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type AddressDraft = { district: string; line1: string; building: string; floor: string; flat: string; landmark: string };
export const emptyAddress: AddressDraft = { district: "", line1: "", building: "", floor: "", flat: "", landmark: "" };

export function addressPayload(a: AddressDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (v.trim()) out[k] = v.trim();
  return out;
}

/** Visit address entry (HOME visits need a district and a street line; the server stores it encrypted). */
export function AddressFields({ value, onChange, idPrefix = "addr" }: { value: AddressDraft; onChange: (a: AddressDraft) => void; idPrefix?: string }) {
  const { t } = useTranslation();
  const set = (k: keyof AddressDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-medium">{t("nurse.address.title")}</legend>
      <Field label={t("nurse.address.district")} htmlFor={`${idPrefix}-district`} hint={t("nurse.address.districtHint")}>
        <Input id={`${idPrefix}-district`} className="min-h-11" value={value.district} onChange={set("district")} />
      </Field>
      <Field label={t("nurse.address.line1")} htmlFor={`${idPrefix}-line1`}>
        <Input id={`${idPrefix}-line1`} className="min-h-11" value={value.line1} onChange={set("line1")} />
      </Field>
      <Field label={t("nurse.address.building")} htmlFor={`${idPrefix}-building`}>
        <Input id={`${idPrefix}-building`} className="min-h-11" value={value.building} onChange={set("building")} />
      </Field>
      <Field label={t("nurse.address.floor")} htmlFor={`${idPrefix}-floor`}>
        <Input id={`${idPrefix}-floor`} className="min-h-11" value={value.floor} onChange={set("floor")} />
      </Field>
      <Field label={t("nurse.address.flat")} htmlFor={`${idPrefix}-flat`}>
        <Input id={`${idPrefix}-flat`} className="min-h-11" value={value.flat} onChange={set("flat")} />
      </Field>
      <Field label={t("nurse.address.landmark")} htmlFor={`${idPrefix}-landmark`}>
        <Input id={`${idPrefix}-landmark`} className="min-h-11" value={value.landmark} onChange={set("landmark")} />
      </Field>
    </fieldset>
  );
}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("geolocation unavailable"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 10_000 });
  });
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: ReactNode }) {
  const map = { ok: "good", warn: "warn", bad: "bad", muted: "neutral" } as const;
  return <StatusChip tone={map[tone]}>{children}</StatusChip>;
}
