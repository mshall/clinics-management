import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { PrismaService } from "../prisma/prisma.service";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { CLINIC_BRAND, NURSE_BRAND, canChangeEdition, isEdition, navigationFor, resolveEdition, terminologyFor, type Edition, type NurseTenantKind, NURSE_HIDDEN_MODULES } from "./nurse-edition";
import { NURSE_PLANS } from "./nurse-plans";

/** The nurse.* keys the web needs to show/hide Nurse-only modules. (Flag evaluation is edition-aware: Clinic orgs always get false.) */
const NURSE_FEATURE_KEYS = ["nurse.care_plans", "nurse.mar", "nurse.private_duty_shifts", "nurse.family_updates", "nurse.individual_kiorex_listing", "clinic.lab_order_handoff", "clinic.home_visits", "clinic.home_route_view", "clinic.home_dispatch"] as const;

@Injectable()
export class NurseEditionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  /** KNED01 — gate for NEW Nurse sign-ups (no org yet: global/market flags only). */
  async assertSignupAllowed(kind: NurseTenantKind): Promise<void> {
    await requireFeature(this.flags, null, "nurse.edition");
    if (kind === "SOLO") await requireFeature(this.flags, null, "nurse.individual_tenants");
  }

  publicPlans() {
    return { priceStatus: "PROPOSED" as const, needsHuman: "NEEDS_HUMAN" as const, note: "Proposed prices, not published: validate with >= 15 willingness-to-pay interviews (KX-23 §05, Q13).", plans: NURSE_PLANS };
  }

  /** Edition for a not-yet-signed-in surface (login / sign-up): decided by the host. */
  publicEdition(host: string | undefined) {
    const edition = resolveEdition({ host });
    return { edition, brand: edition === "NURSE" ? NURSE_BRAND : CLINIC_BRAND, defaultSignIn: edition === "NURSE" ? "KIOREX_PASSPORT" : "PASSWORD_OR_PASSPORT" };
  }

  /** KNED02 — edition context for the signed-in organization: brand, terminology, navigation, enabled Nurse modules. */
  async context(tenantId: string, host?: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { edition: true, nurseTenantKind: true } });
    if (!t) throw new NotFoundException("Organization not found");
    const edition = resolveEdition({ orgEdition: t.edition as Edition, host });
    const kind = (t.nurseTenantKind as NurseTenantKind | null) ?? null;
    const features: Record<string, boolean> = {};
    for (const k of NURSE_FEATURE_KEYS) features[k] = (await this.flags.evaluate(tenantId, k)).effective;
    return {
      edition,
      kind,
      brand: edition === "NURSE" ? NURSE_BRAND : CLINIC_BRAND,
      terminology: terminologyFor(edition, kind),
      navigation: navigationFor(edition, kind),
      hiddenModules: edition === "NURSE" ? NURSE_HIDDEN_MODULES : [],
      features,
      defaultSignIn: edition === "NURSE" ? "KIOREX_PASSPORT" : "PASSWORD_OR_PASSPORT",
    };
  }

  /** KNED04 — ONLY the Kiorex super admin changes an edition. A clinic that employs nurses stays CLINIC. */
  async changeEdition(actor: JwtUser, tenantId: string, edition: string, kind?: string | null) {
    if (!canChangeEdition({ isPlatformSuperAdmin: isPlatformSuperAdmin(actor) })) throw new ForbiddenException({ code: "EDITION_CHANGE_FORBIDDEN", message: "Only the Kiorex super admin can change an organization's edition" });
    if (!isEdition(edition)) throw new BadRequestException("edition must be CLINIC or NURSE");
    if (edition === "NURSE" && kind !== "SOLO" && kind !== "AGENCY") throw new BadRequestException("kind must be SOLO or AGENCY for NURSE");
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, edition: true } });
    if (!t) throw new NotFoundException("Organization not found");
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { edition, nurseTenantKind: edition === "NURSE" ? kind! : null } });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: null, action: "edition.changed", resource: "Tenant", resourceId: tenantId, metadata: { from: t.edition, to: edition } });
    return { tenantId, edition, kind: edition === "NURSE" ? kind : null };
  }

  /** KNED03 — onboarding wizard status: profession verification, coverage zones, services, prices, availability, safety contact. */
  async onboarding(tenantId: string, user: JwtUser) {
    const [tenant, verification, settings, types, availability, me] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { safetyContactPhone: true, nurseTenantKind: true } }),
      this.prisma.clinicianVerification.findUnique({ where: { userId: user.userId }, select: { status: true } }),
      this.prisma.clinicianHomeSettings.findUnique({ where: { tenantId_clinicianId: { tenantId, clinicianId: user.userId } } }),
      this.prisma.appointmentType.findMany({ where: { tenantId, isActive: true, serviceLocation: "HOME" }, select: { feeAmount: true } }),
      this.prisma.clinicianAvailabilityTemplate.count({ where: { tenantId, clinicianId: user.userId } }),
      this.prisma.user.findUnique({ where: { id: user.userId }, select: { profession: true, role: true, additionalRoles: true } }),
    ]);
    const solo = tenant?.nurseTenantKind !== "AGENCY";
    const profession = me ? effectiveProfession(me) : null;
    const steps = [
      { key: "profession_verification", done: verification?.status === VerificationStatus.VERIFIED, applies: solo || profession != null, extra: solo ? ["id_selfie_match", "criminal_record_certificate"] : [] },
      { key: "coverage_zones", done: (settings?.coverageDistrictIds.length ?? 0) > 0, applies: solo },
      { key: "services_offered", done: types.length > 0, applies: true },
      { key: "prices", done: types.length > 0 && types.every((t) => Number(t.feeAmount) > 0), applies: true },
      { key: "availability", done: availability > 0, applies: solo },
      { key: "safety_contact", done: Boolean(tenant?.safetyContactPhone), applies: true },
    ].filter((s) => s.applies);
    return { kind: tenant?.nurseTenantKind ?? null, steps, complete: steps.every((s) => s.done) };
  }
}
