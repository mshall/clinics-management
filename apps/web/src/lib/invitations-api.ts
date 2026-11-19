import { apiUrl } from "@/lib/api-url";
import { apiDelete, apiGet, apiPost } from "@/lib/http";

export class PublicInvitationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) {
    throw new PublicInvitationError(typeof body.message === "string" ? body.message : `Request failed (${res.status})`, res.status, body.code ?? null);
  }
  return body as T;
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type InvitationDto = {
  id: string;
  phoneOrEmail: string;
  channel: "WHATSAPP" | "EMAIL";
  displayName: string;
  roles: string[];
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  sendCount: number;
  lastSentAt: string;
  createdAt: string;
  acceptUrl?: string;
};

export type PublicInvitationDto = {
  clinicName: string;
  clinicNameAr: string;
  roles: string[];
  displayName: string;
  channel: "WHATSAPP" | "EMAIL";
  email: string | null;
  expiresAt: string;
};

export const INVITABLE_ROLES = [
  "RECEPTIONIST",
  "PHYSICIAN",
  "NURSE",
  "CLINIC_ASSISTANT",
  "FINANCE_OFFICER",
  "CALL_CENTER",
  "HR_OFFICER",
] as const;

export function listInvitations() {
  return apiGet<InvitationDto[]>("/api/v1/invitations");
}

export function createInvitation(body: { phoneOrEmail: string; roles: string[]; displayName?: string }) {
  return apiPost<InvitationDto>("/api/v1/invitations", body);
}

export function resendInvitation(id: string) {
  return apiPost<InvitationDto>(`/api/v1/invitations/${id}/resend`, {});
}

export function revokeInvitation(id: string) {
  return apiDelete<InvitationDto>(`/api/v1/invitations/${id}`);
}

export function fetchPublicInvitation(token: string) {
  return publicRequest<PublicInvitationDto>(`/api/v1/public/invitations/${encodeURIComponent(token)}`);
}

export function acceptInvitation(token: string, body: { password: string; email?: string; displayName?: string }) {
  return publicRequest<{ ok: true; email: string }>(`/api/v1/public/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
