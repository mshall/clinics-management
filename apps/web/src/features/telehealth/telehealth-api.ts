import { apiUrl } from "@/lib/api-url";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/http";
import type { JsonFetcher } from "./webrtc/signaling-client";
import type { JoinInfo } from "./webrtc/use-call";

export type TelehealthSessionView = {
  id: string;
  appointmentId: string;
  status: "SCHEDULED" | "WAITING" | "ACTIVE" | "ENDED" | "CANCELLED" | "MISSED";
  mode: "VIDEO" | "AUDIO";
  linkVersion: number;
  startsAt: string;
  endsAt: string | null;
  opensAt: string;
  closesAt: string;
  windowState: "TOO_EARLY" | "OPEN" | "EXPIRED";
  needsStaffReview: boolean;
  attended: boolean;
  enabled: boolean;
  isCurrentClinician: boolean;
  patientName: string;
  patientId: string;
  clinicianId: string;
  clinicId: string;
  timezone: string;
  joinUrl?: string;
};

export type PublicInfo =
  | { state: "INVALID" | "LINK_REVOKED" }
  | {
      state: "OPEN" | "TOO_EARLY" | "EXPIRED" | "CANCELLED" | "CONVERTED_IN_PERSON" | "ENDED" | "MISSED" | "PAYMENT_REQUIRED";
      firstName: string;
      doctorName: string;
      clinicName: string;
      clinicTimezone: string;
      startsAt: string;
      endsAt: string | null;
      opensAt: string;
      closesAt: string;
      mode: "VIDEO" | "AUDIO";
      moved: boolean;
      serverNow: string;
    };

export const getSessionByAppointment = (appointmentId: string) => apiGet<TelehealthSessionView>(`/api/v1/telehealth/appointments/${appointmentId}/session`);
export const createSession = (appointmentId: string) => apiPost<TelehealthSessionView>(`/api/v1/telehealth/appointments/${appointmentId}/session`, {});
export const getSession = (id: string) => apiGet<TelehealthSessionView>(`/api/v1/telehealth/sessions/${id}`);
export const regenerateLink = (id: string) => apiPost<{ linkVersion: number; joinUrl: string }>(`/api/v1/telehealth/sessions/${id}/regenerate-link`, {});
export const joinAsClinician = (id: string) => apiPost<JoinInfo>(`/api/v1/telehealth/sessions/${id}/join`, {});
export const getDoctorSettings = (clinicianId: string) => apiGet<{ clinicianId: string; offersTelehealth: boolean; windows: Record<string, { start: string; end: string }[]> | null; enabled: boolean }>(`/api/v1/telehealth/settings/${clinicianId}`);
export const putDoctorSettings = (clinicianId: string, body: { offersTelehealth?: boolean; windows?: unknown }) => apiPut(`/api/v1/telehealth/settings/${clinicianId}`, body);

/** Authenticated JSON fetcher for the clinician's signaling client. */
export const staffFetcher: JsonFetcher = async (method, path, body) => (method === "GET" ? apiGet(path) : apiPost(path, body));

/** Token JSON fetcher for the patient page: no cookies, no auth header, no localStorage (works in a mobile WebView). */
export const publicFetcher: JsonFetcher = async <T,>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new ApiError(data.message ?? `Failed (${res.status})`, res.status, data);
  return data;
};

export const publicBase = (token: string) => `/api/v1/v/${encodeURIComponent(token)}`;
export const getPublicInfo = (token: string) => publicFetcher<PublicInfo>("GET", `${publicBase(token)}/info`);
export const joinAsPatient = (token: string) => publicFetcher<JoinInfo>("POST", `${publicBase(token)}/join`, {});
