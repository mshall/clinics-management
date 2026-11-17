import { apiUrl } from "@/lib/api-url";
import type { AuthUserDto } from "@/lib/api-schema";

export type SignupMarket = { id: string; code: string; nameEn: string; defaultCurrency: string };

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    const msg = typeof body.message === "string" ? body.message : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function fetchSignupMarkets(): Promise<SignupMarket[]> {
  const res = await fetch(apiUrl("/api/v1/public/signup/markets"));
  return parseJson(res);
}

export async function requestSignupOtp(phone: string, market: string) {
  const res = await fetch(apiUrl("/api/v1/public/signup/otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, market }),
  });
  return parseJson<{ ok: true; expiresAt: string; channel: string }>(res);
}

export async function verifySignupOtp(phone: string, code: string, market: string) {
  const res = await fetch(apiUrl("/api/v1/public/signup/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, market }),
  });
  return parseJson<{ signupToken: string; phone: string; market: string }>(res);
}

export async function completeSignup(body: {
  signupToken: string;
  profile: { displayName: string; email: string; password: string };
  specialty: string;
  clinic: {
    nameEn: string;
    nameAr?: string;
    city: string;
    addressEn?: string;
    addressAr?: string;
    locationUrl?: string;
  };
  planKey: string;
  ref?: string;
  rep?: string;
  legalAcceptances?: { document: string; version: string }[];
}): Promise<{ accessToken: string; refreshToken?: string; sessionId?: string; user: AuthUserDto }> {
  const res = await fetch(apiUrl("/api/v1/public/signup/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}