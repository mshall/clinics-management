import type { PrismaService } from "../prisma/prisma.service";
import { cleanOrgHint, deploymentDefaultMethod, effectiveOrgDefault, resolvePublicSignInConfig, type OrgSignInFacts, type SignInDefaultMethod } from "./sign-in-default";

type Db = Pick<PrismaService, "tenant" | "kiorexIdentityLink" | "marketplaceListing">;

/** Linked to Kiorex = a user with a Kiorex Passport identity link, or a marketplace listing (the clinic is on the Kiorex marketplace). */
export async function tenantLinkedToKiorex(prisma: Db, tenantId: string): Promise<boolean> {
  if ((await prisma.kiorexIdentityLink.count({ where: { user: { tenantId } } })) > 0) return true;
  return (await prisma.marketplaceListing.count({ where: { tenantId } })) > 0;
}

/** Facts for `?org=<organisation id>` (Kiorly Clinic has no org slug: the id is remembered on this browser after a sign-in); null for a missing or unknown org. */
export async function orgSignInFacts(prisma: Db, orgHint: unknown): Promise<OrgSignInFacts | null> {
  const id = cleanOrgHint(orgHint);
  if (!id) return null;
  const t = await prisma.tenant.findUnique({ where: { id }, select: { id: true, defaultSignInMethod: true } });
  if (!t) return null;
  return { stored: t.defaultSignInMethod, linkedToKiorex: await tenantLinkedToKiorex(prisma, t.id) };
}

/** The deployment default; the Nurse edition host keeps its Passport-first default (KNED / ADR-031) unless the deployment sets one. */
export function clinicDeploymentDefault(edition: "CLINIC" | "NURSE", env: Record<string, string | undefined> = process.env): SignInDefaultMethod {
  return env.SIGNIN_DEFAULT_METHOD ? deploymentDefaultMethod(env) : edition === "NURSE" ? "PASSPORT" : "PASSWORD";
}

export { effectiveOrgDefault, resolvePublicSignInConfig };
export type { SignInDefaultMethod };
