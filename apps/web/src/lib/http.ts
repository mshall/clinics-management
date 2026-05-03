import { apiUrl } from "@/lib/api-url";
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

function authHeadersJson(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function authHeadersAny(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { Accept: "*/*" };
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
  if (body && typeof body === "object") {
    const o = body as { message?: unknown; error?: unknown };
    if (Array.isArray(o.message)) {
      return o.message.map((x) => String(x)).join("; ");
    }
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message;
    }
    if (status === 503 && typeof o.error === "string") {
      return `${o.error}. ${typeof o.message === "string" ? o.message : fallback}`;
    }
  }
  return fallback;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeadersJson() });
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

export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers,
    body: formData,
  });
  if (res.status === 401) {
    useAuthStore.getState().signOut();
  }
  if (!res.ok) {
    const parsed = await parseJson(res);
    throw new ApiError(messageFromErrorBody(res.status, parsed, res.statusText || "Request failed"), res.status, parsed);
  }
  return (await res.json()) as T;
}

/** Authenticated GET returning raw bytes (e.g. PDF / image preview). */
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(apiUrl(path), { headers: authHeadersAny() });
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
