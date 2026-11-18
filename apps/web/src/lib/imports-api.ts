import { apiFetchBlob, apiGet, apiPost, apiPostFormData } from "@/lib/http";

export type ImportEntity = "PATIENTS" | "APPOINTMENTS" | "PRICE_LIST" | "STAFF";
export type ImportJobStatus = "VALIDATING" | "READY" | "COMMITTING" | "DONE" | "FAILED" | "UNDONE";
export type DedupeMode = "SKIP" | "MERGE";

export const IMPORT_ENTITIES: ImportEntity[] = ["PATIENTS", "APPOINTMENTS", "PRICE_LIST", "STAFF"];

export type ImportRowError = { row: number; field: string; code: string };

export type ImportJobDto = {
  id: string;
  entity: ImportEntity;
  fileName: string;
  status: ImportJobStatus;
  dedupeMode: DedupeMode;
  totalRows: number;
  okRows: number;
  errorRows: number;
  duplicateRows: number;
  createdRows: number;
  mergedRows: number;
  failureMessage: string | null;
  hasErrorReport: boolean;
  createdAt: string;
  committedAt: string | null;
  undoUntil: string | null;
  canUndo: boolean;
  preview?: Record<string, unknown>[];
  errors?: ImportRowError[];
  undo?: { deleted: number; kept: number };
};

export function listImports() {
  return apiGet<ImportJobDto[]>("/api/v1/imports");
}

export function getImport(id: string) {
  return apiGet<ImportJobDto>(`/api/v1/imports/${id}`);
}

export function uploadImport(entity: ImportEntity, file: File, dedupeMode: DedupeMode) {
  const fd = new FormData();
  fd.append("entity", entity);
  fd.append("dedupeMode", dedupeMode);
  fd.append("file", file);
  return apiPostFormData<ImportJobDto>("/api/v1/imports", fd, { enhance: false });
}

export function commitImport(id: string, dedupeMode: DedupeMode) {
  return apiPost<ImportJobDto>(`/api/v1/imports/${id}/commit`, { dedupeMode });
}

export function undoImport(id: string) {
  return apiPost<ImportJobDto>(`/api/v1/imports/${id}/undo`, {});
}

async function saveBlob(path: string, fileName: string) {
  const { blob } = await apiFetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadImportTemplate(entity: ImportEntity, lang: "en" | "ar") {
  return saveBlob(`/api/v1/imports/templates/${entity}?lang=${lang}`, `kiorly-${entity.toLowerCase()}-${lang}.csv`);
}

export function downloadImportErrorReport(id: string, entity: ImportEntity) {
  return saveBlob(`/api/v1/imports/${id}/error-report`, `${entity.toLowerCase()}-import-errors.csv`);
}
