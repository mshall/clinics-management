import type { LoginResponseDto } from "@/lib/api-schema";
import { apiUrl } from "@/lib/api-url";
import { ApiError } from "@/lib/http";

export type LoginResponse = LoginResponseDto;

function isEmptyErrorBody(data: unknown): boolean {
  return (
    data == null ||
    (typeof data === "object" && !Array.isArray(data) && !("message" in data) && Object.keys(data).length === 0)
  );
}

function loginHttpErrorMessage(status: number, data: unknown, fallback: string): string {
  let msg = fallback;
  if (data && typeof data === "object") {
    if (Array.isArray((data as { message?: unknown }).message)) {
      msg = String((data as { message: string[] }).message[0]);
    } else if (typeof (data as { message?: unknown }).message === "string") {
      msg = (data as { message: string }).message;
    }
  }

  if (status === 503) {
    const hint = import.meta.env.DEV
      ? " (database schema may be out of date — run npm run db:setup locally)"
      : " (service may still be starting after a deploy — wait a minute and try again)";
    return `${msg}${hint}`;
  }

  if (status >= 500 && msg === fallback) {
    if (isEmptyErrorBody(data)) {
      if (import.meta.env.DEV) {
        return `Cannot reach the local API (HTTP ${status}). From the repo root run \`npm run dev\`, wait for "API listening on http://localhost:3000", then open http://localhost:5173/login.`;
      }
      if (status === 502 || status === 503 || status === 504) {
        return "The server is temporarily unavailable (it may be starting up after a deploy). Wait a minute and try again.";
      }
      return "Something went wrong on the server. Please try again in a minute.";
    }
    if (import.meta.env.DEV) {
      return `Server error (${status}). Try again or use password "demo" for seeded accounts.`;
    }
    return "Something went wrong on the server. Please try again in a minute.";
  }

  return msg;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const normalizedEmail = email.normalize("NFKC").trim().toLowerCase();
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
  } catch {
    throw new ApiError(
      import.meta.env.DEV
        ? "Cannot reach the API. Run `npm run dev` from the repo root, then open http://localhost:5173/login."
        : "Cannot reach the server. Check your connection and try again.",
      0
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  const data = (await res.json().catch(() => null)) as LoginResponse | { message?: string | string[] } | null;
  if (!res.ok) {
    throw new ApiError(loginHttpErrorMessage(res.status, data, "Sign in failed"), res.status, data);
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
