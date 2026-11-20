import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PlanKey, SubscriptionStatus, TenantStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as path from "path";
import type { Readable } from "stream";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { loadEmployeePrivilegeGrantSummaries } from "../common/employee-privilege-grants";
import { loadUserMoneyVisibilityOverrides } from "../common/user-money-visibility";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseTabAccessModes } from "../user-nav-tabs/nav-tab-access-modes";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { MfaService, verifyTotpCode } from "./mfa.service";
import { effectiveRoles } from "../common/effective-roles";
import { principalRequiresMfaEnrollment } from "./privileged-mfa";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { applyPlanNavPipeline } from "../entitlements/plan-nav-preset";
import { loginEmailLookupVariants, normalizeLoginEmail } from "./auth-email.util";
import { AuthSessionService } from "./auth-session.service";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type AvatarFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

export type LoginSessionMeta = { userAgent?: string; ipHash?: string };

function passwordMatches(password: string, passwordHash: string | null | undefined): boolean {
  if (!passwordHash) return false;
  try {
    return bcrypt.compareSync(password, passwordHash);
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
    private readonly mfa: MfaService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
    private readonly entitlements: EntitlementsService,
    private readonly sessions: AuthSessionService,
  ) {}

  private async navTabKeysForUser(tenantId: string, userId: string): Promise<string[] | null> {
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!row) return null;
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    return arr.length ? arr : null;
  }

  private async navTabAccessModesForUser(
    tenantId: string,
    userId: string,
  ): Promise<Record<string, "read" | "write"> | null> {
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!row?.tabAccessModes) return null;
    const parsed = parseTabAccessModes(row.tabAccessModes);
    return Object.keys(parsed).length ? parsed : null;
  }

  private async mapAuthUser(user: {
    id: string;
    tenantId: string | null;
    email: string;
    displayName: string;
    role: UserRole;
    additionalRoles?: UserRole[];
    isTenantOwner?: boolean;
    avatarRelativePath?: string | null;
    mfaEnabled?: boolean;
  },
    navTabKeys: string[] | null,
    roleNavTabKeys: string[] | null,
    navTabAccessModes: Record<string, "read" | "write"> | null = null,
    tenantBaseCurrency: string | null = null,
  ) {
    const employeePrivilegeGrants =
      user.tenantId != null
        ? await loadEmployeePrivilegeGrantSummaries(this.prisma, user.tenantId, user.id)
        : [];
    const moneyVisibilityOverrides =
      user.tenantId != null
        ? await loadUserMoneyVisibilityOverrides(this.prisma, user.tenantId, user.id)
        : undefined;
    const mfaEnabled = Boolean(user.mfaEnabled);
    const platformSuperAdmin = isPlatformSuperAdmin({
      email: user.email,
      role: user.role,
      additionalRoles: user.additionalRoles ?? [],
    });
    const entitlementsBundle =
      user.tenantId != null ? await this.entitlements.resolve(user.tenantId) : null;
    // Platform operators have no org subscription — expose Enterprise-level flags so UI
    // gates (e.g. AI assistant) do not show a false "upgrade to Pro" paywall.
    const platformEntitlements = platformSuperAdmin && !user.tenantId
      ? await this.entitlements.resolvePlatformOperator()
      : null;
    const planEntitlements = entitlementsBundle?.entitlements ?? platformEntitlements?.entitlements;
    const planKey = entitlementsBundle?.plan?.key ?? platformEntitlements?.plan.key ?? PlanKey.ENTERPRISE;
    const effectiveNavTabKeys =
      navTabKeys?.length
        ? applyPlanNavPipeline(navTabKeys, planKey, planEntitlements)
        : navTabKeys;
    const effectiveRoleNavTabKeys = roleNavTabKeys?.length
      ? applyPlanNavPipeline(roleNavTabKeys, planKey, planEntitlements)
      : roleNavTabKeys;
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      roles: effectiveRoles(user),
      additionalRoles: user.additionalRoles ?? [],
      isTenantOwner: Boolean(user.isTenantOwner),
      navTabKeys: effectiveNavTabKeys,
      roleNavTabKeys: effectiveRoleNavTabKeys,
      navTabAccessModes: navTabAccessModes ?? undefined,
      tenantBaseCurrency,
      platformSuperAdmin,
      hasAvatar: Boolean(user.avatarRelativePath),
      mfaEnabled,
      mfaEnrollmentRequired: principalRequiresMfaEnrollment(user) && !mfaEnabled,
      employeePrivilegeGrants: employeePrivilegeGrants.length ? employeePrivilegeGrants : undefined,
      moneyVisibilityOverrides:
        moneyVisibilityOverrides &&
        (moneyVisibilityOverrides.operations !== "ROLE_DEFAULT" ||
          moneyVisibilityOverrides.encounters !== "ROLE_DEFAULT" ||
          moneyVisibilityOverrides.appointments !== "ROLE_DEFAULT")
          ? moneyVisibilityOverrides
          : undefined,
      plan: entitlementsBundle?.plan ?? platformEntitlements?.plan,
      entitlements: entitlementsBundle?.entitlements ?? platformEntitlements?.entitlements,
    };
  }

  async login(
    email: string,
    password: string,
    mfaCode?: string,
    meta: LoginSessionMeta = {},
  ) {
    const normalized = normalizeLoginEmail(email);
    const variants = loginEmailLookupVariants(normalized);
    const candidates = await this.prisma.user.findMany({
      where: {
        email: { in: variants },
        deletedAt: null,
        deactivatedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        displayName: true,
        role: true,
        additionalRoles: true,
        isTenantOwner: true,
        passwordHash: true,
        avatarRelativePath: true,
        mfaEnabled: true,
        mfaTotpSecret: true,
        mfaWhatsAppEnabled: true,
        deletedAt: true,
        deactivatedAt: true,
      },
    });
    const user = candidates.find((u) => passwordMatches(password, u.passwordHash));
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.deletedAt || user.deactivatedAt) {
      throw new UnauthorizedException("This account is deactivated or archived");
    }
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { status: true } });
      if (tenant?.status === TenantStatus.PENDING_OWNER) {
        throw new UnauthorizedException({
          message: "This clinic is waiting for the owner to confirm by OTP",
          errorCode: "TENANT_PENDING_OWNER",
        });
      }
    }
    if (user.tenantId && !user.isTenantOwner) {
      const sub = await this.prisma.subscription.findUnique({
        where: { tenantId: user.tenantId },
        select: { status: true },
      });
      if (sub?.status === SubscriptionStatus.SUSPENDED) {
        throw new UnauthorizedException({
          message: "Organization suspended — contact the clinic owner",
          errorCode: "SUBSCRIPTION_SUSPENDED",
        });
      }
    }
    return this.issueLoginSession(user.id, mfaCode, meta, user);
  }

  async createSessionForUserId(userId: string, meta: LoginSessionMeta = {}) {
    return this.issueLoginSession(userId, undefined, meta);
  }

  async refreshSession(refreshToken: string) {
    const rotated = await this.sessions.rotateRefresh(refreshToken);
    return this.issueLoginSession(rotated.userId, undefined, {}, undefined, {
      sessionId: rotated.sessionId,
      refreshToken: rotated.refreshToken,
    });
  }

  async issueLoginSession(
    userId: string,
    mfaCode?: string,
    meta: LoginSessionMeta = {},
    preloaded?: {
      id: string;
      tenantId: string | null;
      email: string;
      displayName: string;
      role: UserRole;
      additionalRoles?: UserRole[];
      isTenantOwner?: boolean;
      avatarRelativePath?: string | null;
      mfaEnabled?: boolean;
      mfaTotpSecret?: string | null;
      mfaWhatsAppEnabled?: boolean;
    },
    existingSession?: { sessionId: string; refreshToken: string },
  ) {
    const user =
      preloaded ??
      (await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null, deactivatedAt: null },
        select: {
          id: true,
          tenantId: true,
          email: true,
          displayName: true,
          role: true,
          additionalRoles: true,
          isTenantOwner: true,
          avatarRelativePath: true,
          mfaEnabled: true,
          mfaTotpSecret: true,
          mfaWhatsAppEnabled: true,
        },
      }));
    if (!user) throw new UnauthorizedException("User not found");

    if (user.mfaEnabled) {
      if (!mfaCode?.trim()) {
        throw new UnauthorizedException({
          message: "Multi-factor authentication code is required",
          errorCode: "MFA_REQUIRED",
          mfaWhatsApp: Boolean(user.mfaWhatsAppEnabled),
        });
      }
      const code = mfaCode.trim();
      const totpOk = user.mfaTotpSecret ? verifyTotpCode(user.mfaTotpSecret, code) : false;
      if (!totpOk) {
        const waOk = user.mfaWhatsAppEnabled ? await this.mfa.verifyWhatsAppMfaCode(user.id, code) : false;
        if (!waOk) {
          const recoveryOk = await this.mfa.consumeRecoveryCode(user.id, code);
          if (!recoveryOk) throw new UnauthorizedException("Invalid authenticator, WhatsApp OTP, or recovery code");
        }
      }
    }

    const session =
      existingSession ?? (await this.sessions.createSession(user.id, meta));
    const accessToken = this.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      sid: session.sessionId,
    });

    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, user.id) : null;
    const navTabAccessModes =
      user.tenantId != null ? await this.navTabAccessModesForUser(user.tenantId, user.id) : null;
    const roleNavTabKeys =
      user.tenantId != null
        ? await this.tenantRoleNav.effectiveRoleNavTabKeysForPrincipal(user.tenantId, user)
        : null;
    const tenantBaseCurrency = user.tenantId
      ? (await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { baseCurrency: true } }))
          ?.baseCurrency ?? null
      : null;

    void this.audit.recordLogin(user, user.email);

    const base = await this.buildLoginResponse(
      user,
      accessToken,
      navTabKeys,
      roleNavTabKeys,
      navTabAccessModes,
      tenantBaseCurrency,
    );
    return {
      ...base,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
    };
  }

  private async buildLoginResponse(
    user: {
      id: string;
      tenantId: string | null;
      email: string;
      displayName: string;
      role: UserRole;
      additionalRoles?: UserRole[];
      isTenantOwner?: boolean;
      avatarRelativePath?: string | null;
      mfaEnabled?: boolean;
    },
    accessToken: string,
    navTabKeys: string[] | null,
    roleNavTabKeys: string[] | null,
    navTabAccessModes: Record<string, "read" | "write"> | null,
    tenantBaseCurrency: string | null,
  ) {
    return {
      accessToken,
      user: await this.mapAuthUser(user, navTabKeys, roleNavTabKeys, navTabAccessModes, tenantBaseCurrency),
    };
  }

  async changePassword(
    userId: string,
    tenantId: string | null,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();
    if (!passwordMatches(currentPassword, user.passwordHash)) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (passwordMatches(newPassword, user.passwordHash)) {
      throw new BadRequestException("New password must be different from the current password");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });
    await this.sessions.revokeAllSessions(user.id);
    return { ok: true as const };
  }

  async me(userId: string, tenantId: string | null) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
    });
    if (!user) throw new UnauthorizedException();
    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, userId) : null;
    const navTabAccessModes =
      user.tenantId != null ? await this.navTabAccessModesForUser(user.tenantId, userId) : null;
    const roleNavTabKeys =
      user.tenantId != null
        ? await this.tenantRoleNav.effectiveRoleNavTabKeysForPrincipal(user.tenantId, user)
        : null;
    const tenantBaseCurrency = user.tenantId
      ? (await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { baseCurrency: true } }))
          ?.baseCurrency ?? null
      : null;
    return await this.mapAuthUser(user, navTabKeys, roleNavTabKeys, navTabAccessModes, tenantBaseCurrency);
  }

  async attachMyAvatar(
    userId: string,
    tenantId: string | null,
    file?: AvatarFile,
  ): Promise<{ ok: true; hasAvatar: true }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, tenantId: true, avatarRelativePath: true },
    });
    if (!user) throw new UnauthorizedException();
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_AVATAR_BYTES) throw new BadRequestException("File too large (max 5MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_AVATAR_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const scope = user.tenantId ?? "platform";
    const docId = randomUUID();
    const base = path.basename(file.originalname || "avatar").replace(/[^\w.\-]+/g, "_").slice(0, 80) || "avatar";
    const relativePath = `${scope}/${user.id}/${docId}-${base}`;
    await this.uploads.put("users", relativePath, file.buffer, mime);

    if (user.avatarRelativePath) {
      await this.uploads.deleteObject("users", user.avatarRelativePath).catch(() => undefined);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarRelativePath: relativePath, avatarMimeType: mime },
    });
    return { ok: true, hasAvatar: true };
  }

  async getMyAvatarMeta(userId: string, tenantId: string | null): Promise<{ mimeType: string; storageKey: string }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { avatarRelativePath: true, avatarMimeType: true },
    });
    if (!user?.avatarRelativePath) throw new NotFoundException("Avatar not found");
    return {
      mimeType: user.avatarMimeType || "image/jpeg",
      storageKey: user.avatarRelativePath,
    };
  }

  async openAvatarReadStream(storageKey: string): Promise<Readable> {
    return this.uploads.getReadStream("users", storageKey);
  }

  async removeMyAvatar(userId: string, tenantId: string | null): Promise<{ ok: true; hasAvatar: false }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, avatarRelativePath: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.avatarRelativePath) {
      await this.uploads.deleteObject("users", user.avatarRelativePath).catch(() => undefined);
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarRelativePath: null, avatarMimeType: null },
    });
    return { ok: true, hasAvatar: false };
  }
}
