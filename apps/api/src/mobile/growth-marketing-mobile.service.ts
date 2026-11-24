import { ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ShareableSlotsService } from "../growth/provider-marketing/shareable-slots.service";
import { SocialTemplatesService } from "../growth/provider-marketing/social-templates.service";
import { StatementsService } from "../growth/provider-marketing/statements.service";
import { VerificationRequestsService } from "../growth/provider-marketing/verification-requests.service";
import { GrowthMobileService } from "./growth-mobile.service";

/**
 * GRW-P2-C staff app facade. `level()` (from GrowthMobileService) applies module scoping; then:
 *  - admin and marketing: everything their web role can do (statements and verification: admin only);
 *  - read: templates only (no render, no slots);
 *  - doctor: share cards and slot cards for their OWN profile only; no statements, no verification.
 */
@Injectable()
export class GrowthMarketingMobileService {
  constructor(
    private readonly base: GrowthMobileService,
    private readonly social: SocialTemplatesService,
    private readonly slotSvc: ShareableSlotsService,
    private readonly statementSvc: StatementsService,
    private readonly verificationSvc: VerificationRequestsService,
  ) {}

  private deny(message: string): never {
    throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message });
  }

  /** A doctor's actions run as the doctor but with the admin-level checks relaxed to "create": the service asserts `create`, so a doctor is given a scoped actor. */
  private actor(u: JwtUser, level: Awaited<ReturnType<GrowthMobileService["level"]>>): JwtUser {
    if (level !== "doctor") return u;
    // A physician has no Growth role on the web; for sharing their own profile they act with the marketing capability, bound to themselves by `selfOnly`.
    return { ...u, role: "CLINIC_ASSISTANT" as JwtUser["role"], additionalRoles: [] };
  }

  async templates(u: JwtUser, q: { locale?: string; clinicId?: string }) {
    const level = await this.base.level(u);
    return this.social.list(this.actor(u, level), q);
  }

  async render(u: JwtUser, b: Record<string, unknown>) {
    const level = await this.base.level(u);
    if (level === "read") this.deny("Your role cannot create share cards");
    const body = { ...b } as Record<string, unknown>;
    if (level === "doctor") {
      body.clinicianId = u.userId; // own profile only
      body.noLinkCreate = true; // a doctor shares existing links; creating one stays with admin and marketing
    }
    return this.social.render(this.actor(u, level), body as never);
  }

  async count(u: JwtUser, b: Record<string, unknown>) {
    const level = await this.base.level(u);
    if (level === "read") this.deny("Your role cannot share");
    return this.social.recordShare(this.actor(u, level), b as never);
  }

  async slots(u: JwtUser, q: { clinicId?: string; clinicianId?: string; days?: number }) {
    const level = await this.base.level(u);
    if (level === "read") this.deny("Your role cannot share slots");
    return this.slotSvc.list(this.actor(u, level), { ...q, selfOnly: level === "doctor", clinicianId: level === "doctor" ? u.userId : q.clinicianId });
  }

  async slotCard(u: JwtUser, b: Record<string, unknown>) {
    const level = await this.base.level(u);
    if (level === "read") this.deny("Your role cannot share slots");
    return this.slotSvc.card(this.actor(u, level), { ...(b as object), selfOnly: level === "doctor", noLinkCreate: level === "doctor", clinicianId: level === "doctor" ? u.userId : (b.clinicianId as string | undefined) } as never);
  }

  private async adminOnly(u: JwtUser) {
    const level = await this.base.level(u);
    if (level !== "admin") this.deny("Only an organisation admin can see Kiorex fee statements and verification requests");
    requireTenantId(u);
  }

  async months(u: JwtUser) { await this.adminOnly(u); return this.statementSvc.months(u); }
  async statement(u: JwtUser, month: string, clinicId?: string) {
    await this.adminOnly(u);
    const s = await this.statementSvc.statement(u, month, clinicId);
    return { ...s, webUrl: `${(process.env.APP_WEB_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "")}/kiorex/growth?tab=statement` };
  }
  async verificationList(u: JwtUser, clinicId?: string) { await this.adminOnly(u); return this.verificationSvc.list(u, { clinicId }); }
  async verificationCreate(u: JwtUser, b: Record<string, unknown>) { await this.adminOnly(u); return this.verificationSvc.create(u, b as never); }
}
