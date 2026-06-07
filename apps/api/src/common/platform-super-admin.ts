import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";

/** Comma-separated emails in PLATFORM_SUPER_ADMIN_EMAILS (legacy env gate). */
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

/** Platform operator: dedicated role and/or legacy email allowlist. */
export function isPlatformSuperAdmin(user: Pick<JwtUser, "email" | "role">): boolean {
  if (user.role === UserRole.PLATFORM_SUPER_ADMIN) return true;
  return isPlatformSuperAdminEmail(user.email);
}
