/** Comma-separated emails in PLATFORM_SUPER_ADMIN_EMAILS may use platform-only admin APIs (data explorer, all-tenants). */
export function platformSuperAdminEmailSet(): Set<string> {
  const raw = process.env.PLATFORM_SUPER_ADMIN_EMAILS ?? "";
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isPlatformSuperAdminEmail(email: string | undefined | null): boolean {
  if (!email?.trim()) return false;
  const set = platformSuperAdminEmailSet();
  if (set.size === 0) return false;
  return set.has(email.trim().toLowerCase());
}
