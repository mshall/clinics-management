import type { LoginResponseDto } from "@/lib/api-schema";
import { apiUrl } from "@/lib/api-url";
import { ApiError } from "@/lib/http";

export type LoginResponse = LoginResponseDto;

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const normalizedEmail = email.normalize("NFKC").trim().toLowerCase();
  const res = await fetch(apiUrl("/api/v1/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: normalizedEmail, password }),
  });
  const data = (await res.json().catch(() => null)) as LoginResponse | { message?: string | string[] } | null;
  if (!res.ok) {
    let msg = "Sign in failed";
    if (data && typeof data === "object") {
      if (Array.isArray((data as { message?: unknown }).message)) {
        msg = String((data as { message: string[] }).message[0]);
      } else if (typeof (data as { message?: unknown }).message === "string") {
        msg = (data as { message: string }).message;
      }
    }
    throw new ApiError(msg, res.status, data);
  }
  return data as LoginResponse;
}
