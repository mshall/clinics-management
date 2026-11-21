import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

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

export function patientName(p: { firstNameEn: string; lastNameEn: string }): string {
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

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

export const emptyAddress: AddressDraft = { district: "", line1: "", building: "", floor: "", flat: "", landmark: "" };

export function addressPayload(a: AddressDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (v.trim()) out[k] = v.trim();
  return out;
}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("geolocation unavailable"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 10_000 });
  });
}

/** Kiorly Nurse web (KNED..KNRPT). Shared pieces: context, error/empty/loading/awaiting-gate states, patient picker, small form helpers. */
export type NurseContext = {
  edition: "CLINIC" | "NURSE";
  kind: "SOLO" | "AGENCY" | null;
  features: Record<string, boolean>;
  defaultSignIn?: string;
};

export type AppointmentTypeRow = { id: string; nameEn: string; nameAr: string; durationMinutes: number; feeAmount: string | number; serviceLocation: "IN_CLINIC" | "HOME"; homeSurchargeAmount?: string | number | null; clinicId?: string | null; isActive: boolean; bufferBeforeMin?: number; bufferAfterMin?: number };

export type AddressDraft = { district: string; line1: string; building: string; floor: string; flat: string; landmark: string };
