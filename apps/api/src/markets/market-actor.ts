import { ForbiddenException } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";

/** Who made a market decision. Recorded on every audit row. */
export type MarketActor = {
  id: string;
  email: string | null;
  /** CLINIC_PLATFORM = Clinic web (platform super admin); KIORLY_ADMIN = Kiorly admin edition of the Ops console over the signed route. */
  source: "CLINIC_PLATFORM" | "KIORLY_ADMIN";
};

export function actorFromJwt(user: Pick<JwtUser, "userId" | "email" | "role" | "additionalRoles">): MarketActor {
  if (!isPlatformSuperAdmin(user)) {
    throw new ForbiddenException({ code: "PLATFORM_SUPER_ADMIN_ONLY", message: "Platform super admin only" });
  }
  return { id: user.userId, email: user.email?.trim() || null, source: "CLINIC_PLATFORM" };
}

const ACTOR_ID = /^[A-Za-z0-9._:@+\-]{1,200}$/;

/** The signed route receives the actor from the Kiorex platform (which authenticated the Ops console user). Strictly validated, never trusted blindly. */
export function actorFromSignedBody(raw: unknown): MarketActor {
  const a = raw as { id?: unknown; email?: unknown } | null | undefined;
  const id = typeof a?.id === "string" ? a.id.trim() : "";
  if (!ACTOR_ID.test(id)) {
    throw new ForbiddenException({ code: "ACTOR_REQUIRED", message: "A valid actor id is required for market changes" });
  }
  const email = typeof a?.email === "string" && a.email.trim().length <= 200 ? a.email.trim() : null;
  return { id: `kiorly-admin:${id}`, email, source: "KIORLY_ADMIN" };
}
