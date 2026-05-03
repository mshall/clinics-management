export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export function parsePageParams(pageStr?: string, pageSizeStr?: string): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);
  const raw = Number.parseInt(pageSizeStr ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, raw));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { items, total, page, pageSize, totalPages: totalPages(total, pageSize) };
}
