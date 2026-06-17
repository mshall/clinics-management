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
  const contentType = res.headers.get("content-type") ?? "";
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
    if (res.status === 503) {
      msg = `${msg} (database schema may be out of date — wait for deploy/migrations to finish)`;
    } else if (res.status >= 500 && msg === "Sign in failed") {
      msg = `Server error (${res.status}). Try again in a minute or use password "demo" for seeded accounts.`;
    }
    throw new ApiError(msg, res.status, data);
  }
  const token = data && typeof data === "object" ? (data as { accessToken?: unknown }).accessToken : undefined;
  const user = data && typeof data === "object" ? (data as { user?: unknown }).user : undefined;
  if (typeof token !== "string" || !token || !user || typeof user !== "object") {
    const bodyStr = typeof data === "string" ? data : "";
    const htmlish = contentType.includes("text/html") || (bodyStr.length > 0 && bodyStr.trim().startsWith("<"));
    const msg = htmlish
      ? "Sign in failed: API returned a web page instead of JSON. Check that /api/* reaches the API (e.g. CloudFront must not replace API errors with the SPA)."
      : "Sign in failed: invalid response from server.";
    throw new ApiError(msg, res.status, data);
  }
  return data as LoginResponse;
}
