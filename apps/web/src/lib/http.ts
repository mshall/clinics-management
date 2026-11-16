import { apiUrl } from "@/lib/api-url";
import { observeWebBuildIdHeader } from "@/lib/deploy-version-watch";
import { localizeApiErrorMessage } from "@/lib/api-error-message";
import { enhanceFormDataImages } from "@/lib/enhance-image";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function clientLanguageHeader(): string {
  const lang = i18n.language?.split("-")[0] ?? "en";
  return lang === "ar" ? "ar" : "en";
}

function authHeadersJson(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": clientLanguageHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function authHeadersAny(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Accept-Language": clientLanguageHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageFromErrorBody(status: number, body: unknown, fallback: string): string {
  if (import.meta.env.DEV && (status === 500 || status === 502 || status === 503)) {
    const empty =
      body == null ||
      body === "" ||
      (typeof body === "string" && !body.trim()) ||
      (typeof body === "object" && !Array.isArray(body) && !("message" in body) && Object.keys(body).length === 0);
    if (empty) {
      return i18n.t(
        "errors.apiUnreachable",
        "Local API is not reachable. From the repo root run npm run dev and wait for the API to be ready.",
      );
    }
  }
  return localizeApiErrorMessage(status, body, fallback);
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(apiUrl(path), { headers: authHeadersAny() });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const body = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, body, res.statusText || "Download failed"), res.status, body);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeadersJson() });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const body = await parseJson(res);
    const msg = messageFromErrorBody(res.status, body, res.statusText || "Request failed");
    throw new ApiError(msg, res.status, body);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { ...authHeadersJson(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  return (await res.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { ...authHeadersJson(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Invalid JSON response", res.status, text);
  }
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { ...authHeadersJson(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  return (await res.json()) as T;
}

export async function apiPostFormData<T>(
  path: string,
  formData: FormData,
  options?: { enhance?: boolean },
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": clientLanguageHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body =
    options?.enhance === false ? formData : await enhanceFormDataImages(formData, "document");
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers,
    body,
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  return (await res.json()) as T;
}

export async function apiPatchFormData<T>(
  path: string,
  formData: FormData,
  options?: { enhance?: boolean },
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": clientLanguageHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body =
    options?.enhance === false ? formData : await enhanceFormDataImages(formData, "document");
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers,
    body,
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** Authenticated GET returning raw bytes (e.g. PDF / image preview). */
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(apiUrl(path), { headers: authHeadersAny() });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const blob = await res.blob();
  return { blob, contentType };
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: authHeadersJson(),
  });
  observeWebBuildIdHeader(res);
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
